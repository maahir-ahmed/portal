import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { setRubricSession, SESSION_MAX_AGE_DAYS } from "@/lib/rubric";
import { z } from "zod";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;
  if (membership!.role !== "EXECUTIVE") {
    return NextResponse.json({ error: "Exec only" }, { status: 403 });
  }

  const soc = await prisma.society.findUnique({
    where: { id: membership!.societyId },
    select: {
      rubricSessionId: true,
      rubricSessionUpdatedAt: true,
      rubricSocietyId: true,
      rubricUnionSessionId: true,
    },
  });

  // Rubric expires a session after about a month, so age is the only warning an
  // exec gets before calls start failing mid-event.
  const savedAt = soc?.rubricSessionUpdatedAt ?? null;
  const ageDays = savedAt ? Math.floor((Date.now() - savedAt.getTime()) / 86_400_000) : null;

  return NextResponse.json({
    configured: !!(soc?.rubricSessionId && soc?.rubricSocietyId),
    rubricSocietyId: soc?.rubricSocietyId ?? null,
    // Never expose the full session ID, just indicate it's set
    sessionConfigured: !!soc?.rubricSessionId,
    unionSessionConfigured: !!soc?.rubricUnionSessionId,
    sessionAgeDays: ageDays,
    sessionMaxAgeDays: SESSION_MAX_AGE_DAYS,
    sessionExpiring: ageDays !== null && ageDays >= SESSION_MAX_AGE_DAYS - 5,
  });
}

// null disconnects: a leaked or misused session has to be killable from the UI,
// without waiting out Rubric's month-long expiry or reaching for psql.
const patchSchema = z.object({
  rubricSessionId: z.string().min(1).nullable().optional(),
  rubricSocietyId: z.string().min(1).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;
  if (membership!.role !== "EXECUTIVE") {
    return NextResponse.json({ error: "Exec only" }, { status: 403 });
  }

  const body = patchSchema.parse(await req.json());
  if (body.rubricSessionId === undefined && body.rubricSocietyId === undefined) {
    return NextResponse.json({ ok: true });
  }

  // The session goes through setRubricSession so it is encrypted and timestamped;
  // the society ID is not a secret and is written directly.
  if (body.rubricSessionId !== undefined) {
    await setRubricSession(membership!.societyId, body.rubricSessionId);
  }
  if (body.rubricSocietyId !== undefined) {
    await prisma.society.update({
      where: { id: membership!.societyId },
      data: { rubricSocietyId: body.rubricSocietyId },
    });
  }

  // Replacing or revoking the Rubric credential is worth a trail: it is the app's
  // most sensitive stored secret.
  const disconnected = body.rubricSessionId === null;
  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: disconnected ? "DELETE" : "UPDATE",
    entityType: "RubricCredentials",
    entityId: membership!.societyId,
    metadata: { sessionChanged: body.rubricSessionId !== undefined, disconnected },
  });

  return NextResponse.json({ ok: true });
}
