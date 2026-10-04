import { z } from "zod";
import { prisma } from "@/lib/db";
import { financialYearOf } from "@/lib/years";

// Statuses that represent money the society has actually committed. Drafts aren't
// submitted; rejected claims are never paid. Neither counts toward spend.
export const COUNTS_TOWARD_SPEND = ["REIMBURSEMENT_PENDING", "REIMBURSED"];

type DecimalLike = { toString(): string } | number | null;
const num = (v: DecimalLike) => (v == null ? null : Number(v));

// Categories carry no money any more (that lives on BudgetAllocation, per year), so
// this picks the plain fields and leaves the legacy Decimal columns behind. Kept here
// so every route/page serialises categories the same way.
export function serialiseCategory(c: {
  id: string; name: string; group: string; sortOrder: number;
  reasoning: string | null; notes: string | null;
}) {
  return { id: c.id, name: c.name, group: c.group, sortOrder: c.sortOrder, reasoning: c.reasoning, notes: c.notes };
}

export function serialiseAllocation(a: {
  year: number; amount: DecimalLike; revised: DecimalLike; worstCase: DecimalLike; actualUsage: DecimalLike;
}) {
  return {
    year: a.year,
    amount: num(a.amount) ?? 0,
    revised: num(a.revised),
    worstCase: num(a.worstCase),
    actualUsage: num(a.actualUsage),
  };
}

// Copies the old hard-coded per-year columns into BudgetAllocation rows, for any
// category that has none yet, so a stack self-migrates the first time its budget is
// read and nobody has to run SQL by hand. Idempotent: a category with any allocation
// is skipped, and skipDuplicates covers two requests racing each other. The 2024
// columns are deliberately left behind: the site keeps 2025 onwards (FIRST_YEAR).
// ponytail: delete this, its callers and the LEGACY columns on BudgetCategory once
// every stack (prod and demo) has opened its budget page on this version.
export async function ensureAllocations(societyId: string) {
  const bare = await prisma.budgetCategory.findMany({
    where: { societyId, allocations: { none: {} } },
  });
  const data = bare.flatMap((c) => [
    ...(c.budget2025 != null
      ? [{ categoryId: c.id, year: 2025, amount: c.budget2025, actualUsage: c.usage2025 }]
      : []),
    // yearlyBudget defaults to 0, so 0 with no worst case means "never set".
    ...(Number(c.yearlyBudget) > 0 || c.worstCase != null
      ? [{ categoryId: c.id, year: 2026, amount: c.yearlyBudget, worstCase: c.worstCase }]
      : []),
  ]);
  if (data.length > 0) await prisma.budgetAllocation.createMany({ data, skipDuplicates: true });
}

const nullableMoney = z.number().min(0).nullable().optional();

/** One category's figures for one year, as the category create/edit routes take them. */
export const allocationSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  amount: z.number().min(0),
  revised: nullableMoney,
  worstCase: nullableMoney,
  actualUsage: nullableMoney,
});

// The current year's spending is worked out from claims, never typed, so a typed-in
// actual is only kept for years that have already closed.
export async function allocationData(societyId: string, a: z.infer<typeof allocationSchema>) {
  const rows = await prisma.societyYear.findMany({ where: { societyId } });
  const closed = a.year < financialYearOf(rows, new Date());
  return { ...a, actualUsage: closed ? a.actualUsage : undefined };
}
