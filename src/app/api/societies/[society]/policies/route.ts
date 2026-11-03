import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { POLICY_KINDS } from "@/lib/policies";
import { z } from "zod";

// Each request type's society additions, keyed by kind. Any member may read them:
// every request form shows its policy. Only executives change them.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const rows = await prisma.policyAddition.findMany({
    where: { societyId: membership!.societyId },
    select: { kind: true, text: true },
  });
  return NextResponse.json(Object.fromEntries(rows.map((r) => [r.kind, r.text])));
}

const schema = z.object({
  kind: z.enum(POLICY_KINDS.map((k) => k.kind) as [string, ...string[]]),
  text: z.string().max(4000),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    const { kind, text } = schema.parse(await req.json());
    const societyId = membership!.societyId;
    // An empty box removes the row rather than storing "", so "no additions" has one shape.
    if (text.trim()) {
      await prisma.policyAddition.upsert({
        where: { societyId_kind: { societyId, kind } },
        create: { societyId, kind, text: text.trim() },
        update: { text: text.trim() },
      });
    } else {
      await prisma.policyAddition.deleteMany({ where: { societyId, kind } });
    }

    await createAuditLog({
      societyId,
      userId: session!.user.id,
      action: "UPDATE",
      entityType: "PolicyAddition",
      entityId: kind,
      metadata: { kind, length: text.trim().length },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
