import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Calendar, Plus, Search, Store, Wallet } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { YearPicker } from "@/components/shared/YearPicker";
import { FIRST_YEAR, financialYearOf, financialYearRange, parseYear, yearOptions } from "@/lib/years";

interface Props {
  params: Promise<{ society: string }>;
  searchParams: Promise<{ q?: string; year?: string }>;
}

// Free-text search over what a claim says, where it was spent and who made it, plus an
// exact match on the amount when the query is a number ("41.2" finds $41.20).
function searchWhere(q: string): Prisma.TreasuryRequestWhereInput {
  const amount = Number(q.replace(/[$,\s]/g, ""));
  return {
    OR: [
      { description: { contains: q, mode: "insensitive" } },
      { locationSupplier: { contains: q, mode: "insensitive" } },
      { submittedBy: { name: { contains: q, mode: "insensitive" } } },
      ...(q.trim() && Number.isFinite(amount) ? [{ amount: { equals: amount } }] : []),
    ],
  };
}

export default async function TreasuryPage({ params, searchParams }: Props) {
  const { society: societySlug } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");

  // Treasury claims are private to their submitter; only execs see everyone's.
  const canSeeAll = membership.role === "EXECUTIVE";

  // Claims run on financial years, AGM to AGM (src/lib/years.ts), bucketed by the
  // expense date. "all" lifts the year filter, which is what a search usually wants.
  const owner = {
    societyId: membership.societyId,
    ...(!canSeeAll ? { submittedById: session.user.id } : {}),
  };
  const [calendar, span] = await Promise.all([
    prisma.societyYear.findMany({ where: { societyId: membership.societyId } }),
    prisma.treasuryRequest.aggregate({ where: owner, _min: { expenseDate: true }, _max: { expenseDate: true } }),
  ]);
  const thisYear = financialYearOf(calendar, new Date());
  const year = sp.year === "all" ? null : parseYear(sp.year) ?? thisYear;
  const range = year === null ? null : financialYearRange(calendar, year);
  const years = yearOptions(
    span._min.expenseDate ? financialYearOf(calendar, span._min.expenseDate) : null,
    Math.max(thisYear, span._max.expenseDate ? financialYearOf(calendar, span._max.expenseDate) : thisYear)
  ).map((y) => {
    const r = financialYearRange(calendar, y);
    const last = formatDate(new Date(r.end.getTime() - 86_400_000));
    return { value: y, label: y <= FIRST_YEAR ? `${y} (up to ${last})` : `${y} (${formatDate(r.start)} to ${last})` };
  });

  const requests = await prisma.treasuryRequest.findMany({
    where: {
      ...owner,
      ...(range ? { expenseDate: { gte: range.start, lt: range.end } } : {}),
      ...(q ? searchWhere(q) : {}),
    },
    include: {
      submittedBy: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Treasury Requests</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Reimbursements and expense claims</p>
        </div>
        <Button asChild data-tour="treasury-new">
          <Link href={`/${societySlug}/requests/treasury/new`}>
            <Plus className="h-4 w-4 mr-2" /> New Claim
          </Link>
        </Button>
      </div>

      {/* A plain GET form: the query lives in the URL, so a search can be shared or reloaded. */}
      <form data-tour="treasury-search" className="flex flex-wrap items-center gap-2" role="search">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search description, supplier, name or amount"
            aria-label="Search expenses"
            className="pl-9"
          />
        </div>
        {year !== null && <input type="hidden" name="year" value={year} />}
        <Button type="submit" variant="outline">Search</Button>
        {q && (
          <Link href={`/${societySlug}/requests/treasury${year === null ? "?year=all" : `?year=${year}`}`} className="text-sm text-muted-foreground hover:text-foreground">
            Clear
          </Link>
        )}
        <div data-tour="treasury-year" className="flex w-full min-w-0 sm:ml-auto sm:w-auto">
          <YearPicker years={years} value={year} label="Financial year" allLabel="All years" />
        </div>
      </form>
      {q && (
        <p className="text-sm text-muted-foreground -mt-3">
          {requests.length} {requests.length === 1 ? "claim matches" : "claims match"} “{q}”{year !== null ? ` in ${year}` : ""}
        </p>
      )}

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            {q ? (
              <p className="text-muted-foreground">
                No claims match “{q}”{year !== null ? ` in ${year}` : ""}. Try a supplier, a word from the description or an amount{year !== null ? ", or all years" : ""}.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground">No reimbursement requests{year !== null ? ` in ${year}` : ""}.</p>
                <Button asChild size="sm">
                  <Link href={`/${societySlug}/requests/treasury/new`}>Submit first claim</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r, i) => {
            const amount = Number(r.amount);
            return (
              <Link key={r.id} href={`/${societySlug}/requests/treasury/${r.id}`} data-tour={i === 0 ? "treasury-card" : undefined}>
                <Card className="hover:border-foreground/20 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <UserAvatar name={r.submittedBy.name} avatarUrl={r.submittedBy.avatarUrl} size="sm" className="mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{r.description}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(r.expenseDate)}</span>
                            <span className="flex items-center gap-1"><Store className="h-3 w-3" />{r.locationSupplier}</span>
                            <span className="font-medium text-green-700">{formatCurrency(amount)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
