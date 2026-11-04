import { createHash, createPublicKey, randomInt, verify } from "node:crypto";
import { prisma } from "./db";
import { modulesForSociety } from "./modulesServer";
import { createPrintingRequest } from "./printingServer";
import { ALLOWED_EXTS, ALLOWED_TYPES, MAX_UPLOAD, extOf, saveUpload } from "./uploads";
import { SIDED_LABELS, type Colour, type PaperSize, type Sided } from "./printing";

// SPIKE (docs/DISCORD_BOT_SPIKE.md): a /print slash command that files a printing
// request from Discord. Discord POSTs each use to /api/discord/interactions (an HTTP
// interactions endpoint, so no bot process or gateway connection), signed with the
// app's Ed25519 key. Off unless ENABLE_DISCORD_BOT=true and DISCORD_GUILD_ID names the
// society's server: the commands are registered for the app, so without it they would
// work in any server the app has been added to.

export const botEnabled = () => process.env.ENABLE_DISCORD_BOT === "true" && !!process.env.DISCORD_GUILD_ID;

// Ed25519 public keys arrive as 32 raw bytes in hex; node wants them wrapped as SPKI.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Whether a request really came from Discord, signed for this app. */
export function verifyDiscordRequest(body: string, signature: string | null, timestamp: string | null, publicKey: string): boolean {
  if (!signature || !timestamp || !/^[0-9a-f]{64}$/i.test(publicKey) || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKey, "hex")]), format: "der", type: "spki" });
  return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
}

// Discord sends each interaction once, at the moment it happens. A signed request older
// than this is a replay (from a log, a proxy), and each replay would file the print job
// and download its file again.
const MAX_AGE_S = 5 * 60;

/** Whether an interaction's signed timestamp is recent enough to be the real thing. */
export function freshInteraction(timestamp: string | null, now = Date.now()): boolean {
  const t = Number(timestamp);
  return Number.isFinite(t) && Math.abs(now / 1000 - t) <= MAX_AGE_S;
}

const choices = (o: Record<string, string>) => Object.entries(o).map(([value, name]) => ({ name, value }));

/** The command as Discord registers it (scripts/discord-register.ts). */
export const PRINT_COMMAND = {
  name: "print",
  description: "Send a printing request to the portal",
  dm_permission: false,
  options: [
    { type: 11, name: "file", description: "What to print (PDF, Word or an image)", required: true },
    { type: 4, name: "copies", description: "How many copies", required: true, min_value: 1, max_value: 1000 },
    { type: 4, name: "pages", description: "Pages in each copy", required: true, min_value: 1, max_value: 500 },
    { type: 3, name: "pickup", description: "When you'll collect it, like 2026-11-20 14:00", required: true },
    { type: 3, name: "size", description: "Paper size (A4 if left out)", choices: choices({ A4: "A4", A3: "A3" }) },
    { type: 3, name: "sides", description: "Single sided if left out", choices: choices(SIDED_LABELS) },
    { type: 3, name: "colour", description: "Black and white if left out", choices: choices({ BW: "Black and white", COLOUR: "Colour" }) },
    { type: 3, name: "notes", description: "Anything else the printers should know" },
  ],
};

export const LINK_COMMAND = {
  name: "link",
  description: "Connect your Discord account to the portal",
  dm_permission: false,
  options: [{ type: 3, name: "code", description: "The code from your Account page on the portal", required: true }],
};

/**
 * Tells Discord the app's commands. Run on every start (src/instrumentation.ts): it
 * replaces the whole list, so it's safe to repeat, and a changed option reaches
 * Discord with the next deploy.
 */
export async function registerCommands() {
  const app = process.env.DISCORD_APP_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!app || !token) return console.warn("ENABLE_DISCORD_BOT is on, but DISCORD_APP_ID or DISCORD_BOT_TOKEN is missing");
  const res = await fetch(`https://discord.com/api/v10/applications/${app}/commands`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bot ${token}` },
    body: JSON.stringify([PRINT_COMMAND, LINK_COMMAND]),
    signal: AbortSignal.timeout(10_000),
  }).catch((err: Error) => err);
  if (res instanceof Error || !res.ok) {
    console.warn(`Couldn't register /print with Discord: ${res instanceof Error ? res.message : res.status}`);
  }
}

/** "2026-11-20 14:00" (or with a T) as naive wall-clock time, how the portal stores pickup times. */
export function parsePickup(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[4] < 24 && +m[5] < 60 ? d : null;
}

interface Interaction {
  application_id: string;
  token: string;
  guild_id?: string;
  member?: { user: DiscordUser };
  user?: DiscordUser;
  data: {
    name: string;
    options?: { name: string; value: string | number }[];
    resolved?: { attachments?: Record<string, { filename: string; size: number; url: string; content_type?: string }> };
  };
}
interface DiscordUser {
  id: string;
  username: string;
}

// Unambiguous letters and digits (no 0/O, 1/I/L), so a code read off a phone types right.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const hashCode = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

/** A fresh link code for the Account page. Replaces any earlier one. */
export async function newLinkCode(userId: string) {
  const code = Array.from({ length: 8 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
  await prisma.user.update({
    where: { id: userId },
    data: { discordLinkCode: hashCode(code), discordLinkExpires: new Date(Date.now() + 15 * 60_000) },
  });
  return code;
}

/** /link: pins the Discord account to whoever was shown this code. */
export async function handleLink(i: Interaction): Promise<string> {
  const discordUser = i.member?.user ?? i.user;
  if (!discordUser || i.guild_id !== process.env.DISCORD_GUILD_ID) return "Use /link in your society's server.";
  const code = String(i.data.options?.find((o) => o.name === "code")?.value ?? "");
  // ponytail: no unique index (adding one makes db push stop a self-hosted start);
  // eight random characters don't collide, and an expired code is refused anyway.
  const user = await prisma.user.findFirst({
    where: { discordLinkCode: hashCode(code) },
    select: { id: true, name: true, discordLinkExpires: true },
  });
  if (!user || !user.discordLinkExpires || user.discordLinkExpires < new Date()) {
    return "That code didn't work. Get a new one from your Account page on the portal.";
  }
  // One portal account per Discord account: linking here unlinks it anywhere else.
  await prisma.$transaction([
    prisma.user.updateMany({ where: { discordUserId: discordUser.id, id: { not: user.id } }, data: { discordUserId: null } }),
    prisma.user.update({
      where: { id: user.id },
      data: { discordUserId: discordUser.id, discordLinkCode: null, discordLinkExpires: null },
    }),
  ]);
  return `Linked to ${user.name} on the portal. You can use /print now.`;
}

/** Files the request and returns the reply to show (only to the person who ran it). */
export async function handlePrint(i: Interaction): Promise<string> {
  const discordUser = i.member?.user ?? i.user;
  if (!discordUser) return "Use /print in your society's server.";
  if (i.guild_id !== process.env.DISCORD_GUILD_ID) return "Use /print in your society's server.";
  const user = await prisma.user.findUnique({ where: { discordUserId: discordUser.id }, select: { id: true } });
  if (!user) {
    return "I don't know who you are on the portal yet. Get a code from your Account page on the portal, run /link with it, then try again.";
  }
  const slug = process.env.SOCIETY_SLUG;
  const membership = await prisma.societyMembership.findFirst({
    where: { userId: user.id, isActive: true, ...(slug ? { society: { slug } } : {}) },
    select: { societyId: true },
  });
  if (!membership) return "Your portal account isn't an active member of the society.";
  if (!(await modulesForSociety(membership.societyId)).printing) return "Printing is switched off on the portal.";

  const opt = Object.fromEntries((i.data.options ?? []).map((o) => [o.name, o.value]));
  const pickupAt = parsePickup(String(opt.pickup ?? ""));
  if (!pickupAt) return "I couldn't read the pickup time. Write it like 2026-11-20 14:00.";

  const file = i.data.resolved?.attachments?.[String(opt.file)];
  if (!file) return "Attach the file to print.";
  const ext = extOf(file.filename);
  if (!ALLOWED_EXTS.includes(ext) || (file.content_type && !ALLOWED_TYPES.includes(file.content_type.split(";")[0]))) {
    return "That file type can't be printed from here. Send a PDF, a Word document or an image.";
  }
  if (file.size > MAX_UPLOAD) return `That file is too big (the limit is ${MAX_UPLOAD / 1024 / 1024} MB).`;
  // Only from Discord's own CDN: the URL is in the signed request, but check anyway.
  if (!/^https:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(file.url)) return "That attachment didn't come from Discord.";
  const res = await fetch(file.url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return "I couldn't download the file from Discord. Try again.";
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_UPLOAD) return "That file is too big.";
  const fileUrl = await saveUpload(bytes, ext);

  const request = await createPrintingRequest(membership.societyId, user.id, {
    pickupAt,
    quantity: Number(opt.copies),
    pages: Number(opt.pages),
    paperSize: (opt.size as PaperSize) ?? "A4",
    sided: (opt.sides as Sided) ?? "SINGLE",
    colour: (opt.colour as Colour) ?? "BW",
    fileUrl,
    fileName: file.filename,
    additionalDetails: opt.notes ? String(opt.notes) : undefined,
  });
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return (
    `Sent to the executives for approval: ${request.quantity} × ${request.pages} pages, ${request.paperSize}, ` +
    `estimated $${Number(request.cost).toFixed(2)}.` +
    (base ? ` Follow it here: ${base}/requests/printing/${request.id}` : "")
  );
}

/** Replaces the "thinking…" placeholder Discord shows while handlePrint runs. */
export async function replyToInteraction(i: Interaction, content: string) {
  // Runs after the response (after()), where nothing else would catch a failure: a
  // network error or a hang would otherwise leave the member looking at "thinking…".
  try {
    const res = await fetch(`https://discord.com/api/v10/webhooks/${i.application_id}/${i.token}/messages/@original`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn(`Discord reply returned ${res.status}`);
  } catch (err) {
    console.warn("Discord reply failed:", err instanceof Error ? err.message : err);
  }
}

export type { Interaction };
