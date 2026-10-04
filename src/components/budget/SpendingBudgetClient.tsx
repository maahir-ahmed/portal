"use client";

import { Fragment, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

/** One category's figures for one financial year. */
export interface YearFigures {
  amount: number;
  revised: number | null;
  worstCase: number | null;
  actualUsage: number | null; // typed in, only for years before claims lived in the app
  spent: number | null; // claims, else actualUsage; null = unknown (a past year with no data)
}
export interface Category {
  id: string;
  name: string;
  group: string; // "PORTFOLIO" | "OTHER"
  reasoning: string | null;
  notes: string | null;
  allocations: Record<number, YearFigures>;
  spent: number; // in the chosen year
}
interface Txn {
  id: string; description: string; amount: number; date: string; status: string;
  submittedByName: string; budgetCategoryId: string | null; counts: boolean;
}

const UNCLASSIFIED = "__none__";
const money = (v: number | null | undefined) => (v == null ? "-" : formatCurrency(v));
const round = (n: number) => Math.round(n * 100) / 100;
// A revision replaces the original amount for the rest of that year.
const budgetOf = (f: YearFigures | undefined) => (f ? f.revised ?? f.amount : 0);

// Sum a column, or null when every category is blank, so an all-dash column totals to a dash.
function total(cats: Category[], pick: (c: Category) => number | null | undefined): number | null {
  const vals = cats.map(pick).filter((v): v is number => v != null);
  return vals.length ? round(vals.reduce((s, v) => s + v, 0)) : null;
}

export function SpendingBudgetClient({
  societySlug, year, currentYear, yearOptions, span, datesEstimated, comparisonYears, categories, transactions, isExec,
}: {
  societySlug: string; year: number; currentYear: number; yearOptions: number[]; span: string;
  datesEstimated: boolean; comparisonYears: number[]; categories: Category[]; transactions: Txn[]; isExec: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const base = `/api/societies/${societySlug}/budget`;
  const [tab, setTab] = useState<"current" | "comparison">("current");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  const yearSet = comparisonYears.includes(year);
  const currentYearSet = comparisonYears.includes(currentYear);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function reclassify(txnId: string, categoryId: string | null) {
    const res = await fetch(`/api/societies/${societySlug}/treasury/${txnId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetCategoryId: categoryId }),
    });
    if (res.ok) router.refresh();
    else toast.error("Could not update category");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Spending budget</h1>
          <p className="text-sm text-muted-foreground">
            {span}.
            {datesEstimated && (
              <>
                {" "}Dates are estimates until the AGM dates are set
                {isExec ? (
                  <>
                    {" "}in{" "}
                    <Link href={`/${societySlug}/settings`} className="underline underline-offset-2 hover:text-foreground">
                      Settings
                    </Link>
                  </>
                ) : null}
                .
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => router.push(`${pathname}?year=${v}`)}>
            <SelectTrigger data-tour="budget-year" className="h-9 w-[9.5rem]" aria-label="Financial year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}{y === currentYear ? " (current)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isExec && <Button data-tour="budget-add" className="gap-2" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add category</Button>}
        </div>
      </div>

      {isExec && !currentYearSet && year !== currentYear && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>The {currentYear} budget hasn&apos;t been set yet.</span>
          <Link href={`${pathname}?year=${currentYear}`} className="font-medium underline underline-offset-4">
            Set the {currentYear} budget
          </Link>
        </div>
      )}

      {/* Sub-tab switcher */}
      <div data-tour="budget-tabs" className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-sm">
        {([["current", `${year}`], ["comparison", "Comparison"]] as const).map(([key, label]) => (
          <button
            key={key}
            data-tour={`budget-tab-${key}`}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md transition-colors ${tab === key ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "current" ? (
        <div className="space-y-6">
          {yearSet ? (
            <CurrentYearView year={year} isCurrent={year === currentYear} categories={categories} onEdit={setEditing} canEdit={isExec} />
          ) : isExec ? (
            <SetBudgetForm base={base} year={year} pastYears={comparisonYears.filter((y) => y < year)}
              categories={categories} onSaved={() => router.refresh()} />
          ) : (
            <Card data-tour="budget-setup">
              <CardContent className="p-5 text-sm text-muted-foreground">
                The {year} budget hasn&apos;t been set yet. The executives will set it, and it will show here once they have.
              </CardContent>
            </Card>
          )}
          {isExec && (transactions.length > 0 || (yearSet && year <= currentYear)) && (
            <ClaimsTable {...{ categories, transactions, onReclassify: reclassify, societySlug, year }} />
          )}
        </div>
      ) : (
        <ComparisonView
          years={comparisonYears} categories={categories} expanded={expanded} onToggle={toggle} onEdit={setEditing} canEdit={isExec}
        />
      )}

      {(editing || creating) && (
        <CategoryDialog
          base={`${base}/categories`}
          category={editing}
          year={year}
          yearSet={yearSet}
          pastYear={year < currentYear}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ── The chosen year's budget vs spend ─────────────────────────────────────────
function CurrentYearView({ year, isCurrent, categories, onEdit, canEdit }: {
  year: number; isCurrent: boolean; categories: Category[]; onEdit: (c: Category) => void; canEdit: boolean;
}) {
  const totalBudget = round(categories.reduce((s, c) => s + budgetOf(c.allocations[year]), 0));
  const totalUsage = round(categories.reduce((s, c) => s + c.spent, 0));
  const left = round(totalBudget - totalUsage);
  return (
    <>
      <div data-tour="budget-totals" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TotalCard label={`${year} budget`} value={totalBudget} />
        <TotalCard label={isCurrent ? "Spent so far" : "Spent"} value={totalUsage} />
        <TotalCard label="Remaining" value={left} valueClass={left < 0 ? "text-red-600" : "text-green-700"} />
      </div>

      <Card data-tour="budget-categories">
        <CardHeader className="pb-3"><CardTitle className="text-base">By category</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet. Use “Add category”.</p>
          ) : categories.map((c) => {
            const budget = budgetOf(c.allocations[year]);
            const remaining = round(budget - c.spent);
            const pctUsed = budget > 0 ? Math.round((c.spent / budget) * 100) : 0;
            const pctLeft = budget > 0 ? Math.max(0, 100 - pctUsed) : 0;
            const over = remaining < 0;
            return (
              <div key={c.id} className="group">
                <div className="flex items-center justify-between gap-x-3 flex-wrap text-sm mb-1">
                  <span className="font-medium flex items-center gap-1.5">
                    {c.name}
                    {canEdit && (
                      <button onClick={() => onEdit(c)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground transition-opacity" title="Edit category">
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                  <span className="text-muted-foreground tabnums">
                    {formatCurrency(c.spent)} of {formatCurrency(budget)}{" · "}
                    <span className={over ? "text-red-600 font-medium" : "text-green-700 font-medium"}>
                      {budget > 0 ? `${pctLeft}% left` : "no budget set"}
                    </span>
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full rounded-full ${over ? "bg-red-500" : pctUsed > 85 ? "bg-amber-500" : "bg-green-500"}`}
                    style={{ width: `${Math.min(100, pctUsed)}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

// ── A year with no allocations: execs set every category's amount at once ─────
function SetBudgetForm({ base, year, pastYears, categories, onSaved }: {
  base: string; year: number; pastYears: number[]; categories: Category[]; onSaved: () => void;
}) {
  const lastYear = pastYears.at(-1);
  // Each amount starts at the category's most recent earlier budget, which is the
  // previous year's for any category that had one.
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(categories.map((c) => {
    const prev = [...pastYears].reverse().map((y) => c.allocations[y]).find(Boolean);
    return [c.id, prev ? String(budgetOf(prev)) : ""];
  })));
  const [busy, setBusy] = useState(false);

  const filled = categories.filter((c) => (amounts[c.id] ?? "").trim() !== "");
  const newTotal = round(filled.reduce((s, c) => s + (Number(amounts[c.id]) || 0), 0));

  async function save() {
    if (filled.length === 0) { toast.error("Give at least one category an amount"); return; }
    setBusy(true);
    const res = await fetch(`${base}/allocations/${year}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocations: filled.map((c) => ({ categoryId: c.id, amount: Number(amounts[c.id]) || 0 })) }),
    });
    setBusy(false);
    if (res.ok) { toast.success(`${year} budget saved`); onSaved(); }
    else toast.error((await res.json().catch(() => ({}))).error ?? "Could not save the budget");
  }

  // Read-only history, newest first, so the year being set sits next to the input on
  // a phone and older years are a scroll away. Last year's spend sits beside its budget.
  const history = [...pastYears].reverse().flatMap((y) => [
    { key: `${y}`, label: `${y}`, value: (c: Category) => c.allocations[y] && budgetOf(c.allocations[y]) },
    ...(y === lastYear ? [{ key: `${y}-spent`, label: `${y} spent`, value: (c: Category) => c.allocations[y]?.spent }] : []),
  ]);
  const cell = "py-2 px-3 text-right whitespace-nowrap tabnums";
  const sticky = "sticky left-0 z-10 bg-card";

  return (
    <Card data-tour="budget-setup">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Set the {year} budget</CardTitle>
        <CardDescription>
          {lastYear
            ? `Each amount starts at the category's ${lastYear} budget, with earlier years alongside to compare. `
            : "No earlier budgets to start from, so every amount starts blank. "}
          Leave a category blank to leave it out of {year}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No categories yet. Use “Add category” first.</p>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className={`py-2 pr-3 font-medium ${sticky}`}>Category</th>
                  <th className="py-2 px-3 font-medium text-right text-foreground">{year}</th>
                  {history.map((h) => <th key={h.key} className="py-2 px-3 font-medium text-right whitespace-nowrap">{h.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className={`py-2 pr-3 font-medium ${sticky}`}>{c.name}</td>
                    <td className="py-1.5 px-3 text-right">
                      <Input
                        type="number" step="0.01" min="0" inputMode="decimal"
                        aria-label={`${c.name} ${year} budget`}
                        value={amounts[c.id] ?? ""}
                        onChange={(e) => setAmounts((a) => ({ ...a, [c.id]: e.target.value }))}
                        className="h-9 w-28 ml-auto text-right tabnums"
                      />
                    </td>
                    {history.map((h) => <td key={h.key} className={`${cell} text-muted-foreground`}>{money(h.value(c))}</td>)}
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className={`py-2 pr-3 ${sticky}`}>Total</td>
                  <td className={cell}>{formatCurrency(newTotal)}</td>
                  {history.map((h) => <td key={h.key} className={cell}>{money(total(categories, h.value))}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy || categories.length === 0}>{busy ? "Saving…" : `Save ${year} budget`}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Treasury claims in the chosen year, filterable by category and sortable ───
const ALL = "__all__";
type ClaimSort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";
const SORTS: { value: ClaimSort; label: string }[] = [
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest first" },
  { value: "amount-desc", label: "Amount: high to low" },
  { value: "amount-asc", label: "Amount: low to high" },
];

function ClaimsTable({ categories, transactions, onReclassify, societySlug, year }: {
  categories: Category[]; transactions: Txn[];
  onReclassify: (id: string, cat: string | null) => void; societySlug: string; year: number;
}) {
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [sort, setSort] = useState<ClaimSort>("date-desc");

  const filtered = transactions.filter((t) =>
    categoryFilter === ALL
      ? true
      : categoryFilter === UNCLASSIFIED
        ? t.budgetCategoryId === null
        : t.budgetCategoryId === categoryFilter
  );

  const shown = [...filtered].sort((a, b) => {
    switch (sort) {
      case "amount-desc": return b.amount - a.amount;
      case "amount-asc": return a.amount - b.amount;
      case "date-asc": return new Date(a.date).getTime() - new Date(b.date).getTime();
      default: return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
  });

  // Rejected claims are struck through in the table and excluded here for the same
  // reason: the point of narrowing to a category is seeing what it actually spent.
  const counted = round(shown.filter((t) => t.counts).reduce((s, t) => s + t.amount, 0));
  const filtering = categoryFilter !== ALL;

  return (
      <Card data-tour="budget-claims">
        <CardHeader className="pb-3"><CardTitle className="text-base">Treasury claims in {year}</CardTitle></CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No treasury claims in {year}.</p>
          ) : (
            <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 w-[13rem]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  <SelectItem value={UNCLASSIFIED}>Unclassified</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as ClaimSort)}>
                <SelectTrigger className="h-9 w-[12rem]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SORTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground tabnums">
                {/* When filtering, the noun follows the total, not the shown count:
                    "1 of 5 claims", never "1 of 5 claim". */}
                {filtering ? `${shown.length} of ${transactions.length}` : shown.length}
                {(filtering ? transactions.length : shown.length) === 1 ? " claim" : " claims"}
                {" · "}{formatCurrency(counted)} counted
              </p>
            </div>
            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No claims in that category.</p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Description</th>
                    <th className="py-2 pr-3 font-medium">By</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium text-right">Amount</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{formatDate(t.date)}</td>
                      <td className="py-2 pr-3">
                        <Link href={`/${societySlug}/requests/treasury/${t.id}`} className="hover:underline">{t.description}</Link>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{t.submittedByName}</td>
                      <td className="py-2 pr-3"><StatusBadge status={t.status} /></td>
                      <td className={`py-2 pr-3 text-right font-medium whitespace-nowrap tabnums ${t.counts ? "" : "text-muted-foreground line-through"}`}>
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="py-2 pr-3">
                        <Select value={t.budgetCategoryId ?? UNCLASSIFIED}
                          onValueChange={(v) => onReclassify(t.id, v === UNCLASSIFIED ? null : v)}>
                          <SelectTrigger className="h-8 min-w-[10rem]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNCLASSIFIED}>Unclassified</SelectItem>
                            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Struck-through amounts (rejected claims) don’t count toward spend. Drafts are excluded entirely.
            </p>
            </>
          )}
        </CardContent>
      </Card>
  );
}

// ── Every year with a budget, side by side ────────────────────────────────────
type Col = { year: number; key: "amount" | "revised" | "spent" | "worstCase"; label: string };

function ComparisonView({ years, categories, expanded, onToggle, onEdit, canEdit }: {
  years: number[]; categories: Category[]; expanded: Set<string>; onToggle: (id: string) => void;
  onEdit: (c: Category) => void; canEdit: boolean;
}) {
  // Optional columns appear only for years where some category has a value, so a year
  // without revisions or worst cases doesn't carry a column of dashes.
  const has = (y: number, k: Col["key"]) => categories.some((c) => c.allocations[y]?.[k] != null);
  // Newest first, so on a phone the year people care about is on screen before scrolling.
  const groups = [...years].reverse().map((y) => ({
    year: y,
    cols: ([
      { year: y, key: "amount", label: "Budget" },
      has(y, "revised") && { year: y, key: "revised", label: "Revised" },
      has(y, "spent") && { year: y, key: "spent", label: "Spent" },
      has(y, "worstCase") && { year: y, key: "worstCase", label: "Worst case" },
    ] as const).filter((c): c is Col => !!c),
  }));
  const cols = groups.flatMap((g) => g.cols);
  const width = cols.length + 2;
  const sticky = "sticky left-0 z-10";

  return (
    <Card data-tour="budget-comparison">
      <CardContent className="p-0">
        {years.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">No year has a budget yet.</p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground bg-muted">
                <th className={`py-2 px-3 ${sticky} bg-muted`} />
                {groups.map((g) => (
                  <th key={g.year} colSpan={g.cols.length} className="pt-2.5 pb-1 px-3 font-semibold text-foreground text-center border-l">{g.year}</th>
                ))}
                <th />
              </tr>
              <tr className="text-left text-muted-foreground border-b bg-muted">
                <th className={`py-2 px-3 font-medium ${sticky} bg-muted`}>Category</th>
                {cols.map((c, i) => (
                  <th key={`${c.year}-${c.key}`} className={`py-2 px-3 font-medium text-right whitespace-nowrap ${i === 0 || cols[i - 1].year !== c.year ? "border-l" : ""}`}>{c.label}</th>
                ))}
                <th className="py-2 px-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <CategoryRow key={c.id} c={c} cols={cols} width={width} open={expanded.has(c.id)}
                  onToggle={() => onToggle(c.id)} onEdit={() => onEdit(c)} canEdit={canEdit} />
              ))}
              <tr className="border-t-2 bg-muted font-semibold">
                <td className={`py-2.5 px-3 ${sticky} bg-muted`}>Total</td>
                {cols.map((col, i) => (
                  <td key={`${col.year}-${col.key}`} className={`py-2.5 px-3 text-right whitespace-nowrap tabnums ${i === 0 || cols[i - 1].year !== col.year ? "border-l" : ""}`}>
                    {money(total(categories, (c) => c.allocations[col.year]?.[col.key]))}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        )}
      </CardContent>
    </Card>
  );
}

function TotalCard({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 tabnums ${valueClass ?? ""}`}>{formatCurrency(value)}</p>
      </CardContent>
    </Card>
  );
}

function CategoryRow({ c, cols, width, open, onToggle, onEdit, canEdit }: {
  c: Category; cols: Col[]; width: number; open: boolean; onToggle: () => void; onEdit: () => void; canEdit: boolean;
}) {
  const hasDetail = !!(c.reasoning || c.notes);
  return (
    <Fragment>
      <tr className={`border-b group/row ${hasDetail ? "cursor-pointer" : ""}`} onClick={hasDetail ? onToggle : undefined}>
        <td className={`py-2.5 px-3 sticky left-0 z-10 bg-card ${hasDetail ? "group-hover/row:bg-muted" : ""}`}>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {hasDetail
              ? <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
              : <span className="w-3.5" />}
            {c.name}
          </span>
        </td>
        {cols.map((col, i) => {
          const f = c.allocations[col.year];
          const over = col.key === "spent" && f?.spent != null && f.spent > budgetOf(f);
          return (
            <td key={`${col.year}-${col.key}`}
              className={`py-2.5 px-3 text-right whitespace-nowrap tabnums ${i === 0 || cols[i - 1].year !== col.year ? "border-l" : ""} ${over ? "text-red-600 font-medium" : ""} ${hasDetail ? "group-hover/row:bg-muted/50" : ""}`}>
              {money(f?.[col.key])}
            </td>
          );
        })}
        <td className="py-2.5 px-3 text-right">
          {canEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-muted-foreground hover:text-foreground p-1" title="Edit category">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </td>
      </tr>
      {open && hasDetail && (
        <tr className="border-b bg-muted/30">
          <td colSpan={width} className="py-3 px-3 pl-9">
            {/* Pinned to the left edge so it stays readable while the figures scroll. */}
            <div className="sticky left-9 grid gap-3 sm:grid-cols-2 max-w-[min(56rem,calc(100vw-6rem))]">
              {c.reasoning && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Reasoning</p>
                  <p className="text-sm whitespace-pre-wrap">{c.reasoning}</p>
                </div>
              )}
              {c.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Questions and notes</p>
                  <p className="text-sm whitespace-pre-wrap">{c.notes}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// Numeric input that maps "" -> null so optional money fields can be cleared.
const moneyField = (v: number | null | undefined) => (v == null ? "" : String(v));
const optMoney = (s: string): number | null => (s.trim() === "" ? null : Number(s));

function CategoryDialog({ base, category, year, yearSet, pastYear, onClose, onSaved }: {
  base: string; category: Category | null; year: number; yearSet: boolean; pastYear: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const editing = !!category;
  const figures = category?.allocations[year];
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: category?.name ?? "",
    group: category?.group === "OTHER" ? "OTHER" : "PORTFOLIO",
    amount: moneyField(figures?.amount ?? (editing ? null : 0)),
    revised: moneyField(figures?.revised),
    worstCase: moneyField(figures?.worstCase),
    actualUsage: moneyField(figures?.actualUsage),
    reasoning: category?.reasoning ?? "",
    notes: category?.notes ?? "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      group: form.group,
      reasoning: form.reasoning.trim() || null,
      notes: form.notes.trim() || null,
      // Until the year's budget exists, amounts belong to the set-budget form, so a
      // lone category here can't half-create the year.
      ...(yearSet && {
        allocation: {
          year,
          amount: Number(form.amount) || 0,
          revised: optMoney(form.revised),
          worstCase: optMoney(form.worstCase),
          ...(pastYear && { actualUsage: optMoney(form.actualUsage) }),
        },
      }),
    };
    const res = await fetch(editing ? `${base}/${category!.id}` : base, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.ok) onSaved();
    else toast.error((await res.json().catch(() => ({}))).error ?? "Could not save category");
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    const res = await fetch(`${base}/${category!.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onSaved();
    else toast.error("Could not delete category");
  }

  const numField = (k: keyof typeof form, label: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" step="0.01" min="0" inputMode="decimal" value={form[k]} onChange={set(k)} className="h-9 tabnums" />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={set("name")} className="h-9" placeholder="e.g. Careers" />
            </div>
            <div>
              <Label className="text-xs">Group</Label>
              <Select value={form.group} onValueChange={(v) => setForm((f) => ({ ...f, group: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PORTFOLIO">Portfolio</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {yearSet ? (
            <div className="grid grid-cols-2 gap-3">
              {numField("amount", `${year} budget`)}
              {numField("revised", "Revised mid-year")}
              {numField("worstCase", "Worst case")}
              {pastYear && numField("actualUsage", "Actual spend")}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The {year} budget hasn&apos;t been set yet. {editing ? "This category's" : "The new category's"} {year} amount goes in the set-budget form.
            </p>
          )}
          <div>
            <Label className="text-xs">Reasoning</Label>
            <Textarea value={form.reasoning} onChange={set("reasoning")} rows={4} />
          </div>
          <div>
            <Label className="text-xs">Questions and notes</Label>
            <Textarea value={form.notes} onChange={set("notes")} rows={3} />
          </div>
          <p className="text-xs text-muted-foreground">
            {pastYear
              ? `Actual spend is for years before claims were made here. It's used only when no claims in ${year} count toward this category.`
              : `Spending in ${year} is worked out from classified treasury claims, so it can't be typed here.`}
          </p>
        </div>
        <DialogFooter className="flex sm:justify-between gap-2">
          {editing
            ? <Button variant="ghost" onClick={remove} disabled={busy} className="text-red-600 hover:text-red-700 gap-2"><Trash2 className="h-4 w-4" /> Delete</Button>
            : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
