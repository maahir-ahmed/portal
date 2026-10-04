import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { COUNTS_TOWARD_SPEND, ensureAllocations, serialiseAllocation, serialiseCategory } from "@/lib/budget";
import { financialYearOf, financialYearRange, parseYear, yearOptions, FIRST_YEAR } from "@/lib/years";
import { formatDate } from "@/lib/utils";
import { SpendingBudgetClient, type Category, type YearFigures } from "@/components/budget/SpendingBudgetClient";

interface Props {
  params: Promise<{ society: string }>;
  searchParams: Promise<{ year?: string }>;
}

const round = (n: number) => Math.round(n * 100) / 100;

export default async function BudgetPage({ params, searchParams }: Props) {
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
  await ensureAllocations(societyId);

  // ponytail: every non-draft claim is loaded and bucketed by financial year in JS,
  // because the comparison needs spend for every year. Fine at a society's scale
  // (hundreds a year); move to a SQL sum per AGM-to-AGM range if it ever isn't.
  const [yearRows, categoriesRaw, treasuryRaw] = await Promise.all([
    prisma.societyYear.findMany({ where: { societyId } }),
    prisma.budgetCategory.findMany({
      where: { societyId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { allocations: true },
    }),
    prisma.treasuryRequest.findMany({
      where: { societyId, status: { not: "DRAFT" } },
      orderBy: { expenseDate: "desc" },
      include: { submittedBy: { select: { name: true } } },
    }),
  ]);

  const currentYear = financialYearOf(yearRows, new Date());
  const year = parseYear((await searchParams).year) ?? currentYear;
  const { start, end } = financialYearRange(yearRows, year);

  // Counted spend per category per financial year, and which years have any at all.
  const spendKey = (cat: string, y: number) => `${cat}:${y}`;
  const claimSpend = new Map<string, number>();
  const claimYears = new Set<number>();
  for (const t of treasuryRaw) {
    if (!t.budgetCategoryId || !COUNTS_TOWARD_SPEND.includes(t.status)) continue;
    const fy = financialYearOf(yearRows, t.expenseDate);
    const k = spendKey(t.budgetCategoryId, fy);
    claimSpend.set(k, (claimSpend.get(k) ?? 0) + Number(t.amount));
    claimYears.add(fy);
  }

  // Claims win once a category has any in a year. A typed-in actual only stands in for
  // years before claims lived in the app. Null means "nothing to show", a dash: a past
  // year with no claims anywhere is unknown, and a future year can't have spent yet.
  function spentIn(catId: string, y: number, actualUsage: number | null): number | null {
    const fromClaims = claimSpend.get(spendKey(catId, y));
    if (fromClaims != null) return round(fromClaims);
    if (actualUsage != null) return actualUsage;
    return claimYears.has(y) || y === currentYear ? 0 : null;
  }

  const allocationYears = new Set<number>();
  const categories: Category[] = categoriesRaw.map((c) => {
    const allocations: Record<number, YearFigures> = {};
    for (const a of c.allocations) {
      const s = serialiseAllocation(a);
      allocations[a.year] = { ...s, spent: spentIn(c.id, a.year, s.actualUsage) };
      allocationYears.add(a.year);
    }
    return {
      ...serialiseCategory(c),
      allocations,
      spent: allocations[year]?.spent ?? spentIn(c.id, year, null) ?? 0,
    };
  });

  const transactions = treasuryRaw
    .filter((t) => t.expenseDate >= start && t.expenseDate < end)
    .map((t) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      date: t.expenseDate.toISOString(),
      status: t.status,
      submittedByName: t.submittedBy.name,
      budgetCategoryId: t.budgetCategoryId,
      counts: COUNTS_TOWARD_SPEND.includes(t.status),
    }));

  const dataYears = [...allocationYears, ...claimYears];
  const options = yearOptions(
    Math.min(year, ...dataYears),
    Math.max(currentYear + 1, year, ...dataYears),
  );
  // Formatted here rather than in the browser so the dates read the same in every
  // timezone (they are UTC midnights, see years.ts).
  // The first year has no AGM before it (it reaches back to cover anything earlier).
  const datesEstimated = [year - 1, year].some((y) => y >= FIRST_YEAR && !yearRows.find((r) => r.year === y)?.agmDate);
  const verb = year < currentYear ? "ran" : "runs";
  const span =
    year <= FIRST_YEAR
      ? `${year} ${verb} up to the ${formatDate(end)} AGM`
      : `${year} ${verb} from the ${formatDate(start)} AGM to the ${formatDate(end)} AGM`;

  return (
    <SpendingBudgetClient
      societySlug={societySlug}
      year={year}
      currentYear={currentYear}
      yearOptions={options}
      span={span}
      datesEstimated={datesEstimated}
      comparisonYears={[...allocationYears].sort((a, b) => a - b)}
      categories={categories}
      transactions={isExec ? transactions : []}
      isExec={isExec}
    />
  );
}
