import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { encryptSecret, NO_SECRET_KEY, secretStorageReady } from "@/lib/secrets";
import { demoEnabled } from "@/lib/rubricDemo";
import { ownsServerSettings, emailSettings } from "@/lib/serverSettings";
import { MAIL_PORTS, notificationEmail, publicMailAddress, sendEmail } from "@/lib/email";
import { z } from "zod";

// Settings > Email: the email service the portal sends through, set in the app rather
// than the server's env file (src/lib/serverSettings.ts). Exec only. The password or key
// never travels back to the browser: GET says only whether one is saved.

type Params = { params: Promise<{ society: string }> };

async function exec(society: string) {
  // Not found rather than forbidden, as for backups: another society's slug gets no confirmation.
  if (!ownsServerSettings(society)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const { session, error } = await requireAuth();
  if (error) return { error };
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return { error: memErr };
  return { session: session!, membership: membership! };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const r = await exec((await params).society);
  if ("error" in r) return r.error;
  const s = await emailSettings();
  const own = await prisma.society.findUnique({ where: { id: r.membership.societyId }, select: { smtpHost: true } });
  return NextResponse.json({
    // "app": set here. "server": from the env file. "off": switched off here. null: nothing set anywhere.
    source: s?.source ?? (own?.smtpHost === "" ? "off" : null),
    host: s?.host ?? "",
    port: s?.port ?? 587,
    user: s?.user ?? "",
    from: s?.from ?? "",
    passSet: !!s?.pass,
  });
}

const schema = z.union([
  z.object({ mode: z.literal("off") }),
  // Back to whatever the server's env file says.
  z.object({ mode: z.literal("server") }),
  z.object({
    mode: z.literal("app"),
    host: z.string().trim().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "That doesn't look like a server name, like smtp-relay.brevo.com"),
    port: z.coerce.number().refine((n) => MAIL_PORTS.includes(n), "The port is usually 587, 465, 25 or 2525"),
    user: z.string().trim().max(200),
    // Blank keeps the saved one, so other fields can change without pasting it again.
    pass: z.string().trim().max(500),
    from: z
      .string()
      .trim()
      .max(200)
      .regex(/^([^<>]*<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/, "Write it like Chess Society <noreply@example.org>"),
  }),
]);

export async function PUT(req: NextRequest, { params }: Params) {
  const r = await exec((await params).society);
  if ("error" in r) return r.error;
  // Every demo visitor is an executive: one could send mail as the demo, or read where it goes.
  if (demoEnabled()) return NextResponse.json({ error: "Email can't be set up on the public demo" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : null;
    return NextResponse.json({ error: msg ?? "Invalid request" }, { status: 400 });
  }

  const where = { id: r.membership.societyId };
  if (body.mode !== "app") {
    const blank = { smtpPort: null, smtpUser: null, smtpPass: null, emailFrom: null };
    await prisma.society.update({ where, data: { smtpHost: body.mode === "off" ? "" : null, ...blank } });
  } else {
    const saved = await prisma.society.findUnique({ where, select: { smtpPass: true, smtpHost: true, smtpUser: true } });
    if (!body.pass && !saved?.smtpPass) return NextResponse.json({ error: "Paste the password or key" }, { status: 400 });
    // A saved key is only ever presented to the server and login it was saved for: pointing the
    // host at another server and pressing "Send test email" would otherwise hand it the key.
    if (!body.pass && (body.host.toLowerCase() !== (saved?.smtpHost ?? "").toLowerCase() || body.user !== (saved?.smtpUser ?? ""))) {
      return NextResponse.json({ error: "You changed the server or login, so paste the password or key again" }, { status: 400 });
    }
    if (body.pass && !secretStorageReady()) return NextResponse.json({ error: NO_SECRET_KEY }, { status: 400 });
    await prisma.society.update({
      where,
      data: {
        smtpHost: body.host,
        smtpPort: body.port,
        smtpUser: body.user,
        emailFrom: body.from,
        ...(body.pass ? { smtpPass: encryptSecret(body.pass) } : {}),
      },
    });
  }

  await createAuditLog({
    societyId: r.membership.societyId,
    userId: r.session.user.id,
    action: "UPDATE",
    entityType: "EmailSettings",
    entityId: r.membership.societyId,
    metadata:
      body.mode === "app"
        ? { mode: "app", host: body.host, port: body.port, from: body.from, password: body.pass ? "changed" : "unchanged" }
        : { mode: body.mode },
  });
  return NextResponse.json({ ok: true });
}

// "Send test email": to the executive pressing it, through the saved settings, so a
// wrong key or an unverified sender shows up here rather than in a new member's inbox.
export async function POST(_req: NextRequest, { params }: Params) {
  const r = await exec((await params).society);
  if ("error" in r) return r.error;
  if (demoEnabled()) return NextResponse.json({ error: "Email can't be set up on the public demo" }, { status: 403 });

  let s = await emailSettings();
  if (!s) return NextResponse.json({ error: "Email is off. Save your settings first." }, { status: 400 });
  // A server typed into the app must be a real mail server on a public address: this button
  // connects to it, so otherwise it could probe whatever else runs on this machine. The env
  // file's server is the host's own choice and is left alone.
  if (s.source === "app") {
    const ip = MAIL_PORTS.includes(s.port) ? await publicMailAddress(s.host) : null;
    if (!ip) return NextResponse.json({ error: "That email server can't be reached from here. Check the server name and port." }, { status: 400 });
    s = { ...s, host: ip, servername: s.host };
  }
  const title = "Test email from your society portal";
  const body = `This is the test you asked for. Email is working: new members will get their sign-in details from ${s.from}.`;
  try {
    await sendEmail({ to: r.session.user.email!, subject: title, html: notificationEmail(title, body), text: body }, s);
  } catch (err) {
    // An SMTP answer ("Invalid login", "Sender not verified") is the mail server's own words and
    // worth showing; anything else is a connection error that could describe this machine's network.
    if (err instanceof Error && typeof (err as { responseCode?: unknown }).responseCode === "number") {
      return NextResponse.json({ error: `The email service refused it: ${err.message.slice(0, 300)}` }, { status: 502 });
    }
    return NextResponse.json({ error: "Couldn't connect to the email server. Check the server name and port." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, to: r.session.user.email });
}
