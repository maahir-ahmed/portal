import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
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
    select: { rubricSessionId: true, rubricSocietyId: true, rubricUnionSessionId: true },
  });

  return NextResponse.json({
    configured: !!(soc?.rubricSessionId && soc?.rubricSocietyId),
    rubricSocietyId: soc?.rubricSocietyId ?? null,
    // Never expose the full session ID, just indicate it's set
    sessionConfigured: !!soc?.rubricSessionId,
    unionSessionConfigured: !!soc?.rubricUnionSessionId,
  });
}

const patchSchema = z.object({
  rubricSessionId: z.string().min(1).optional(),
  rubricSocietyId: z.string().min(1).optional(),
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

  const updateData: Record<string, string | null> = {};
  if (body.rubricSessionId !== undefined) updateData.rubricSessionId = body.rubricSessionId;
  if (body.rubricSocietyId !== undefined) updateData.rubricSocietyId = body.rubricSocietyId;

  if (Object.keys(updateData).length > 0) {
    await prisma.society.update({ where: { id: membership!.societyId }, data: updateData });
  }

  return NextResponse.json({ ok: true });
}
