import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { encryptSecret, NO_SECRET_KEY, secretStorageReady } from "@/lib/secrets";
import { demoEnabled } from "@/lib/rubricDemo";
import { botSettings } from "@/lib/serverSettings";
import { registerCommands } from "@/lib/discordBot";
import { z } from "zod";

// Settings > Discord > the /print bot (docs/DISCORD_BOT_SPIKE.md), set in the app rather
// than the server's env file. Exec only; the bot token never travels back to the browser.

type Params = { params: Promise<{ society: string }> };

async function exec(society: string) {
  const { session, error } = await requireAuth();
  if (error) return { error };
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return { error: memErr };
  return { session: session!, membership: membership! };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const r = await exec((await params).society);
  if ("error" in r) return r.error;
  const bot = await botSettings();
  const own = await prisma.society.findUnique({
    where: { id: r.membership.societyId },
    select: { discordBotEnabled: true, discordAppId: true, discordPublicKey: true, discordGuildId: true, discordBotToken: true },
  });
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return NextResponse.json({
    on: !!bot,
    source: bot?.source ?? null,
    // What's saved here, so a half-finished setup can be finished without retyping.
    appId: bot?.appId ?? own?.discordAppId ?? "",
    publicKey: bot?.publicKey ?? own?.discordPublicKey ?? "",
    guildId: bot?.guildId ?? own?.discordGuildId ?? "",
    tokenSet: !!bot?.token || !!own?.discordBotToken,
    interactionsUrl: `${base}/api/discord/interactions`,
  });
}

const snowflake = (what: string) => z.string().trim().regex(/^\d{17,20}$/, `The ${what} is a 17 to 20 digit number`);
const schema = z.union([
  z.object({ on: z.literal(false) }),
  z.object({
    on: z.literal(true),
    appId: snowflake("application ID"),
    publicKey: z.string().trim().regex(/^[0-9a-f]{64}$/i, "The public key is 64 letters and numbers, from General Information"),
    guildId: snowflake("server ID"),
    // Blank keeps the saved one.
    token: z.string().trim().max(200),
  }),
]);

export async function PUT(req: NextRequest, { params }: Params) {
  const r = await exec((await params).society);
  if ("error" in r) return r.error;
  // Every demo visitor is an executive: one could point the demo at their own bot.
  if (demoEnabled()) return NextResponse.json({ error: "The bot can't be set up on the public demo" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : null;
    return NextResponse.json({ error: msg ?? "Invalid request" }, { status: 400 });
  }

  const where = { id: r.membership.societyId };
  if (!body.on) {
    await prisma.society.update({ where, data: { discordBotEnabled: false } });
  } else {
    const saved = await prisma.society.findUnique({ where, select: { discordBotToken: true } });
    if (!body.token && !saved?.discordBotToken) return NextResponse.json({ error: "Paste the bot token" }, { status: 400 });
    if (body.token && !secretStorageReady()) return NextResponse.json({ error: NO_SECRET_KEY }, { status: 400 });
    await prisma.society.update({
      where,
      data: {
        discordBotEnabled: true,
        discordAppId: body.appId,
        discordPublicKey: body.publicKey.toLowerCase(),
        discordGuildId: body.guildId,
        ...(body.token ? { discordBotToken: encryptSecret(body.token) } : {}),
      },
    });
  }

  await createAuditLog({
    societyId: r.membership.societyId,
    userId: r.session.user.id,
    action: "UPDATE",
    entityType: "DiscordBot",
    entityId: r.membership.societyId,
    metadata: body.on
      ? { on: true, appId: body.appId, guildId: body.guildId, token: body.token ? "changed" : "unchanged" }
      : { on: false },
  });

  // Saved either way; a refusal here is something to fix in Discord, said in its words.
  const bot = body.on ? await botSettings() : null;
  const problem = bot ? await registerCommands(bot) : null;
  return NextResponse.json({ ok: true, problem });
}
