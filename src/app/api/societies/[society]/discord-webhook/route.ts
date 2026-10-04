import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/secrets";
import { z } from "zod";

// The Discord webhook the exec queue posts to. Exec-only, and the URL never travels
// back to the browser — anyone holding it can post into the channel as the society,
// so this reports only whether one is set, the same shape as the Rubric credentials.

// Two webhooks share this route, picked by ?channel=: the exec queue (default) and the
// marketing events channel, which also has a role to ping on each new request.
type Channel = "queue" | "events";
const channelOf = (req: NextRequest): Channel =>
  req.nextUrl.searchParams.get("channel") === "events" ? "events" : "queue";
const COLUMN = { queue: "discordWebhookUrl", events: "eventsWebhookUrl" } as const;

async function requireExec(userId: string, society: string) {
  const { membership, error } = await requireMembership(userId, society);
  if (error) return { error };
  if (membership!.role !== "EXECUTIVE") {
    return { error: NextResponse.json({ error: "Exec only" }, { status: 403 }) };
  }
  return { membership };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error } = await requireExec(session!.user.id, society);
  if (error) return error;

  const channel = channelOf(req);
  const soc = await prisma.society.findUnique({
    where: { id: membership!.societyId },
    select: { discordWebhookUrl: true, eventsWebhookUrl: true, eventsWebhookRoleId: true },
  });

  return NextResponse.json({
    configured: !!soc?.[COLUMN[channel]],
    ...(channel === "events" ? { roleId: soc?.eventsWebhookRoleId ?? null } : {}),
  });
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
    .nullable()
    .optional(), // left out when only the events role is being changed
  // Events channel only. A Discord role ID (a snowflake); "" or null clears it.
  roleId: z
    .union([z.string().regex(/^\d{17,20}$/, "A role ID is the 17 to 20 digit number from Copy Role ID"), z.literal(""), z.null()])
    .optional(),
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

  const channel = channelOf(req);
  await prisma.society.update({
    where: { id: membership!.societyId },
    data: {
      // undefined leaves the URL alone, so the role can be changed without re-pasting it.
      ...(body.webhookUrl !== undefined
        ? { [COLUMN[channel]]: body.webhookUrl ? encryptSecret(body.webhookUrl) : null }
        : {}),
      ...(channel === "events" && body.roleId !== undefined ? { eventsWebhookRoleId: body.roleId || null } : {}),
    },
  });

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "UPDATE",
    entityType: "DiscordWebhook",
    entityId: membership!.societyId,
    metadata: { channel, configured: !!body.webhookUrl },
  });

  const soc = await prisma.society.findUnique({
    where: { id: membership!.societyId },
    select: { discordWebhookUrl: true, eventsWebhookUrl: true, eventsWebhookRoleId: true },
  });
  return NextResponse.json({
    configured: !!soc?.[COLUMN[channel]],
    ...(channel === "events" ? { roleId: soc?.eventsWebhookRoleId ?? null } : {}),
  });
}

// Fires a test post, so an exec finds out the webhook works now rather than when the
// first real submission quietly fails to appear.
export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error } = await requireExec(session!.user.id, society);
  if (error) return error;

  const channel = channelOf(req);
  const soc = await prisma.society.findUnique({
    where: { id: membership!.societyId },
    select: { discordWebhookUrl: true, eventsWebhookUrl: true, eventsWebhookRoleId: true, name: true },
  });
  const stored = soc?.[COLUMN[channel]];
  if (!soc || !stored) {
    return NextResponse.json({ error: "No webhook saved yet" }, { status: 400 });
  }

  let url: string;
  try {
    url = decryptSecret(stored);
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
        // Shows the role tag so you can check it's the right role, without pinging it.
        ...(channel === "events" && soc.eventsWebhookRoleId
          ? { content: `New requests will ping <@&${soc.eventsWebhookRoleId}>.`, allowed_mentions: { roles: [] } }
          : {}),
        embeds: [
          {
            title: "Webhook connected",
            description: `${session!.user.name} sent this test from ${soc.name}'s portal. ${
              channel === "events" ? "New event and marketing requests" : "Exec queue notifications"
            } will arrive here.`,
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
