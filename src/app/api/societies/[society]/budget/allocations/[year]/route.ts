import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { parseYear } from "@/lib/years";
import { z } from "zod";

type Params = { society: string; year: string };

const setSchema = z.object({
  allocations: z.array(z.object({
    categoryId: z.string().min(1),
    amount: z.number().min(0),
  })).min(1).max(200),
});

// Set a whole year's budget in one go (exec only): the budget page's prompt for a
// year with no allocations. A category already set for the year is left as it is
// (skipDuplicates), so a double submit can't overwrite anything.
export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society, year: yearParam } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const year = parseYear(yearParam);
  if (year == null) return NextResponse.json({ error: "Invalid year" }, { status: 400 });

  try {
    const { allocations } = setSchema.parse(await req.json());
    const ids = [...new Set(allocations.map((a) => a.categoryId))];
    const owned = await prisma.budgetCategory.count({
      where: { id: { in: ids }, societyId: membership!.societyId },
    });
    if (owned !== ids.length) return NextResponse.json({ error: "Unknown category" }, { status: 400 });

    const { count } = await prisma.budgetAllocation.createMany({
      data: allocations.map((a) => ({ categoryId: a.categoryId, year, amount: a.amount })),
      skipDuplicates: true,
    });
    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "CREATE",
      entityType: "BudgetAllocation",
      entityId: String(year),
      metadata: { year, categories: count },
    });
    return NextResponse.json({ ok: true, created: count }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save the budget" }, { status: 500 });
  }
}
