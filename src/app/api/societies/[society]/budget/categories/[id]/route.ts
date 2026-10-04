import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { allocationData, allocationSchema, serialiseCategory } from "@/lib/budget";

type Params = { society: string; id: string };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  group: z.enum(["PORTFOLIO", "OTHER"]).optional(),
  allocation: allocationSchema.optional(),
  reasoning: z.string().max(5000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

// Edit a category (exec only), and its figures for the year being viewed.
export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const target = await prisma.budgetCategory.findUnique({ where: { id } });
  if (!target || target.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { allocation, ...body } = patchSchema.parse(await req.json());
    const figures = allocation && await allocationData(membership!.societyId, allocation);
    const updated = await prisma.budgetCategory.update({
      where: { id },
      data: {
        ...body,
        ...(figures && {
          allocations: {
            upsert: {
              where: { categoryId_year: { categoryId: id, year: figures.year } },
              create: figures,
              update: figures,
            },
          },
        }),
      },
    });
    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "UPDATE",
      entityType: "BudgetCategory",
      entityId: id,
      ...(figures && { metadata: { year: figures.year } }),
    });
    return NextResponse.json(serialiseCategory(updated));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
  }
}

// Delete a category (exec only), with its budget in every year (cascade). Classified
// treasury claims keep their history but become unclassified (categoryId set null via
// the schema relation).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const target = await prisma.budgetCategory.findUnique({ where: { id } });
  if (!target || target.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.budgetCategory.delete({ where: { id } });
  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "DELETE",
    entityType: "BudgetCategory",
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
