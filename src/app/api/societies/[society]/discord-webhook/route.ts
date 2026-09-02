import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/secrets";
import { z } from "zod";

// The Discord webhook the exec queue posts to. Exec-only, and the URL never travels
// back to the browser — anyone holding it can post into the channel as the society,
// so this reports only whether one is set, the same shape as the Rubric credentials.

async function requireExec(userId: string, society: string) {
  const { membership, error } = await requireMembership(userId, society);
  if (error) return { error };
  if (membership!.role !== "EXECUTIVE") {
    return { error: NextResponse.json({ error: "Exec only" }, { status: 403 }) };
  }
  return { membership };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error } = await requireExec(session!.user.id, society);
  if (error) return error;

  const soc = await prisma.society.findUnique({
    where: { id: membership!.societyId },
    select: { discordWebhookUrl: true },
  });

  return NextResponse.json({ configured: !!soc?.discordWebhookUrl });
}

// null disconnects, so a webhook that leaks or points at the wrong channel can be
// removed from the UI rather than from psql.
const schema = z.object({
  webhookUrl: z
    .string()
    .url()
    // Discord rejects anything else anyway, and pinning the host stops the app being
    // pointed at an arbitrary URL it would then POST society activity to.
    .refine(
      (u) => /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(u),
      "That is not a Discord webhook URL"
    )
    .nullable(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error } = await requireExec(session!.user.id, society);
  if (error) return error;

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await prisma.society.update({
    where: { id: membership!.societyId },
    data: { discordWebhookUrl: body.webhookUrl ? encryptSecret(body.webhookUrl) : null },
  });

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "UPDATE",
    entityType: "DiscordWebhook",
    entityId: membership!.societyId,
    metadata: { configured: !!body.webhookUrl },
  });

  return NextResponse.json({ configured: !!body.webhookUrl });
}

// Fires a test post, so an exec finds out the webhook works now rather than when the
// first real submission quietly fails to appear.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error } = await requireExec(session!.user.id, society);
  if (error) return error;

  const soc = await prisma.society.findUnique({
    where: { id: membership!.societyId },
    select: { discordWebhookUrl: true, name: true },
  });
  if (!soc?.discordWebhookUrl) {
    return NextResponse.json({ error: "No webhook saved yet" }, { status: 400 });
  }

  let url: string;
  try {
    url = decryptSecret(soc.discordWebhookUrl);
  } catch {
    return NextResponse.json({ error: "The saved webhook could not be read" }, { status: 500 });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        username: "Society Portal",
        embeds: [
          {
            title: "Webhook connected",
            description: `${session!.user.name} sent this test from ${soc.name}'s portal. Exec queue notifications will arrive here.`,
            color: 0x00ffd1,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Discord rejected it (${res.status}). Check the webhook still exists.` },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Could not reach Discord" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
