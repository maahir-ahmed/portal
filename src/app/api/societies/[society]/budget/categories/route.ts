import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { serialiseCategory } from "@/lib/budget";

// List budget categories (any member, the treasury form needs them too).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const categories = await prisma.budgetCategory.findMany({
    where: { societyId: membership!.societyId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(categories.map(serialiseCategory));
}

const nullableMoney = z.number().min(0).nullable().optional();
const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  group: z.enum(["PORTFOLIO", "OTHER"]).optional(),
  yearlyBudget: z.number().min(0).default(0),
  budget2024: nullableMoney,
  budget2024v2: nullableMoney,
  budget2025: nullableMoney,
  usage2025: nullableMoney,
  worstCase: nullableMoney,
  reasoning: z.string().max(5000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

// Create a category (exec only).
export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    const body = createSchema.parse(await req.json());
    const count = await prisma.budgetCategory.count({ where: { societyId: membership!.societyId } });
    const created = await prisma.budgetCategory.create({
      data: { societyId: membership!.societyId, sortOrder: count, ...body },
    });
    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "CREATE",
      entityType: "BudgetCategory",
      entityId: created.id,
    });
    return NextResponse.json(serialiseCategory(created), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
  }
}
