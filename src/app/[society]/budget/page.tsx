import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { serialiseCategory } from "@/lib/budget";
import { SpendingBudgetClient } from "@/components/budget/SpendingBudgetClient";

interface Props {
  params: Promise<{ society: string }>;
}

// Statuses that represent money the society has actually committed. Drafts aren't
// submitted; rejected claims are never paid — neither counts toward live spend.
const COUNTS_TOWARD_SPEND = ["SUBMITTED", "AWAITING_APPROVAL", "APPROVED", "REIMBURSEMENT_PENDING", "REIMBURSED"];

export default async function BudgetPage({ params }: Props) {
  const { society: societySlug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");
  // All members can see the budget totals; only execs get the individual claims
  // list (treasury claims are private) and the edit controls.
  const isExec = membership.role === "EXECUTIVE";

  const societyId = membership.societyId;

  const [categoriesRaw, treasuryRaw] = await Promise.all([
    prisma.budgetCategory.findMany({
      where: { societyId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.treasuryRequest.findMany({
      where: { societyId, status: { not: "DRAFT" } },
      orderBy: { expenseDate: "desc" },
      include: { submittedBy: { select: { name: true } } },
    }),
  ]);

  const transactions = treasuryRaw.map((t) => ({
    id: t.id,
    description: t.description,
    amount: Number(t.amount),
    date: t.expenseDate.toISOString(),
    status: t.status,
    submittedByName: t.submittedBy.name,
    budgetCategoryId: t.budgetCategoryId,
    counts: COUNTS_TOWARD_SPEND.includes(t.status),
  }));

  // Live current-year spend per category (only claims that count).
  const usageByCat = new Map<string, number>();
  for (const t of transactions) {
    if (t.counts && t.budgetCategoryId) {
      usageByCat.set(t.budgetCategoryId, (usageByCat.get(t.budgetCategoryId) ?? 0) + t.amount);
    }
  }

  const categories = categoriesRaw.map((c) => ({
    ...serialiseCategory(c),
    usage2026: Math.round((usageByCat.get(c.id) ?? 0) * 100) / 100,
  }));

  return (
    <SpendingBudgetClient
      societySlug={societySlug}
      categories={categories}
      transactions={isExec ? transactions : []}
      isExec={isExec}
    />
  );
}
