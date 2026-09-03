"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PiggyBank, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface Category {
  id: string;
  name: string;
  group: string; // "PORTFOLIO" | "OTHER"
  yearlyBudget: number; // 2026 budget
  budget2024: number | null;
  budget2024v2: number | null;
  budget2025: number | null;
  usage2025: number | null;
  worstCase: number | null;
  reasoning: string | null;
  notes: string | null;
  usage2026: number; // live, computed
}
interface Txn {
  id: string; description: string; amount: number; date: string; status: string;
  submittedByName: string; budgetCategoryId: string | null; counts: boolean;
}

const UNCLASSIFIED = "__none__";
const money = (v: number | null) => (v == null ? "-" : formatCurrency(v));

type SumField = "budget2024" | "budget2024v2" | "budget2025" | "usage2025" | "yearlyBudget" | "usage2026" | "worstCase";
function sumOf(cats: Category[], field: SumField): number {
  return Math.round(cats.reduce((s, c) => s + (Number(c[field]) || 0), 0) * 100) / 100;
}

export function SpendingBudgetClient({ societySlug, categories, transactions, isExec }: {
  societySlug: string; categories: Category[]; transactions: Txn[]; isExec: boolean;
}) {
  const router = useRouter();
  const base = `/api/societies/${societySlug}/budget/categories`;
  const [tab, setTab] = useState<"current" | "comparison">("current");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  const totalBudget = sumOf(categories, "yearlyBudget");
  const totalUsage = sumOf(categories, "usage2026");

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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#00ffd1] flex items-center justify-center">
            <PiggyBank className="h-5 w-5 text-black" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Spending Budget</h1>
            <p className="text-sm text-muted-foreground">Track this year&apos;s spend, and compare budgets across years.</p>
          </div>
        </div>
        {isExec && <Button data-tour="budget-add" className="gap-2" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add category</Button>}
      </div>

      {/* Sub-tab switcher */}
      <div data-tour="budget-tabs" className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-sm">
        {([["current", "Current Year"], ["comparison", "Comparison"]] as const).map(([key, label]) => (
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
        <CurrentYearView
          categories={categories} transactions={transactions}
          totalBudget={totalBudget} totalUsage={totalUsage}
          onEdit={setEditing} onReclassify={reclassify} societySlug={societySlug} canEdit={isExec}
        />
      ) : (
        <ComparisonView
          categories={categories} expanded={expanded} onToggle={toggle} onEdit={setEditing} canEdit={isExec}
        />
      )}

      {(editing || creating) && (
        <CategoryDialog
          base={base}
          category={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ── Current-year budget vs live usage ─────────────────────────────────────────
function CurrentYearView({ categories, transactions, totalBudget, totalUsage, onEdit, onReclassify, societySlug, canEdit }: {
  categories: Category[]; transactions: Txn[]; totalBudget: number; totalUsage: number;
  onEdit: (c: Category) => void; onReclassify: (id: string, cat: string | null) => void; societySlug: string; canEdit: boolean;
}) {
  return (
    <div className="space-y-6">
      <div data-tour="budget-totals" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TotalCard label="2026 Budget" value={totalBudget} />
        <TotalCard label="Spent so far" value={totalUsage} />
        <TotalCard label="Remaining" value={Math.round((totalBudget - totalUsage) * 100) / 100}
          valueClass={totalBudget - totalUsage < 0 ? "text-red-600" : "text-green-700"} />
      </div>

      <Card data-tour="budget-categories">
        <CardHeader className="pb-3"><CardTitle className="text-base">By Category</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet. Use “Add category”.</p>
          ) : categories.map((c) => {
            const remaining = Math.round((c.yearlyBudget - c.usage2026) * 100) / 100;
            const pctUsed = c.yearlyBudget > 0 ? Math.round((c.usage2026 / c.yearlyBudget) * 100) : 0;
            const pctLeft = c.yearlyBudget > 0 ? Math.max(0, 100 - pctUsed) : 0;
            const over = remaining < 0;
            return (
              <div key={c.id} className="group">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium flex items-center gap-1.5">
                    {c.name}
                    {canEdit && (
                      <button onClick={() => onEdit(c)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity" title="Edit category">
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {formatCurrency(c.usage2026)} of {formatCurrency(c.yearlyBudget)}{" · "}
                    <span className={over ? "text-red-600 font-medium" : "text-green-700 font-medium"}>
                      {c.yearlyBudget > 0 ? `${pctLeft}% left` : "no budget set"}
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

      {canEdit && <ClaimsTable {...{ categories, transactions, onReclassify, societySlug }} />}
    </div>
  );
}

// ── Treasury claims, filterable by category and sortable ──────────────────────
const ALL = "__all__";
type ClaimSort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";
const SORTS: { value: ClaimSort; label: string }[] = [
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest first" },
  { value: "amount-desc", label: "Amount: high to low" },
  { value: "amount-asc", label: "Amount: low to high" },
];

function ClaimsTable({ categories, transactions, onReclassify, societySlug }: {
  categories: Category[]; transactions: Txn[];
  onReclassify: (id: string, cat: string | null) => void; societySlug: string;
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
  const total = Math.round(shown.filter((t) => t.counts).reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const filtering = categoryFilter !== ALL;

  return (
      <Card data-tour="budget-claims">
        <CardHeader className="pb-3"><CardTitle className="text-base">Treasury Claims</CardTitle></CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No treasury claims yet.</p>
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
                {filtering ? `${shown.length} of ${transactions.length}` : shown.length}
                {shown.length === 1 ? " claim" : " claims"} · {formatCurrency(total)} counted
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
                      <td className={`py-2 pr-3 text-right font-medium whitespace-nowrap ${t.counts ? "" : "text-muted-foreground line-through"}`}>
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

// ── Archival year-by-year comparison ──────────────────────────────────────────
function ComparisonView({ categories, expanded, onToggle, onEdit, canEdit }: {
  categories: Category[]; expanded: Set<string>; onToggle: (id: string) => void; onEdit: (c: Category) => void; canEdit: boolean;
}) {
  return (
    <Card data-tour="budget-comparison">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b bg-muted/30">
                <th className="py-2.5 px-3 font-medium">Category</th>
                <th className="py-2.5 px-3 font-medium text-right">2024</th>
                <th className="py-2.5 px-3 font-medium text-right">2024 v2</th>
                <th className="py-2.5 px-3 font-medium text-right">2025 Budget</th>
                <th className="py-2.5 px-3 font-medium text-right">2025 Usage</th>
                <th className="py-2.5 px-3 font-medium text-right">2026 Budget</th>
                <th className="py-2.5 px-3 font-medium text-right">Worst case</th>
                <th className="py-2.5 px-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <CategoryRow key={c.id} c={c} open={expanded.has(c.id)} onToggle={() => onToggle(c.id)} onEdit={() => onEdit(c)} canEdit={canEdit} />
              ))}
              {categories.length > 0 && <TotalRow cats={categories} />}
              {categories.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">No categories yet. Use “Add category”.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function TotalCard({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${valueClass ?? ""}`}>{formatCurrency(value)}</p>
      </CardContent>
    </Card>
  );
}

function CategoryRow({ c, open, onToggle, onEdit, canEdit }: { c: Category; open: boolean; onToggle: () => void; onEdit: () => void; canEdit: boolean }) {
  const hasDetail = !!(c.reasoning || c.notes);
  return (
    <>
      <tr className={`border-b ${hasDetail ? "hover:bg-muted/20 cursor-pointer" : ""}`} onClick={hasDetail ? onToggle : undefined}>
        <td className="py-2.5 px-3">
          <span className="inline-flex items-center gap-1.5">
            {hasDetail
              ? <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
              : <span className="w-3.5" />}
            {c.name}
          </span>
        </td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap">{money(c.budget2024)}</td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap">{money(c.budget2024v2)}</td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap">{money(c.budget2025)}</td>
        <td className={`py-2.5 px-3 text-right whitespace-nowrap ${c.usage2025 != null && c.budget2025 != null && c.usage2025 > c.budget2025 ? "text-red-600 font-medium" : ""}`}>{money(c.usage2025)}</td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap font-medium">{money(c.yearlyBudget)}</td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap">{money(c.worstCase)}</td>
        <td className="py-2.5 px-3 text-right">
          {canEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-muted-foreground hover:text-foreground p-1" title="Edit category">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </td>
      </tr>
      {open && hasDetail && (
        <tr className="border-b bg-muted/10">
          <td colSpan={8} className="py-3 px-3 pl-9">
            <div className="grid gap-3 sm:grid-cols-2 max-w-4xl">
              {c.reasoning && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Reasoning</p>
                  <p className="text-sm whitespace-pre-wrap">{c.reasoning}</p>
                </div>
              )}
              {c.notes && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Questions / Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{c.notes}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function TotalRow({ cats }: { cats: Category[] }) {
  const cell = (f: SumField) => <td className="py-2.5 px-3 text-right whitespace-nowrap">{formatCurrency(sumOf(cats, f))}</td>;
  return (
    <tr className="border-b border-t-2 bg-muted/60 font-bold">
      <td className="py-2.5 px-3">All Total</td>
      {cell("budget2024")}{cell("budget2024v2")}{cell("budget2025")}{cell("usage2025")}
      {cell("yearlyBudget")}{cell("worstCase")}
      <td />
    </tr>
  );
}

// Numeric input that maps "" -> null so optional money fields can be cleared.
function moneyField(v: number | null): string { return v == null ? "" : String(v); }

function CategoryDialog({ base, category, onClose, onSaved }: {
  base: string; category: Category | null; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!category;
  const [busy, setBusy] = useState(false);
  const [showPrevYears, setShowPrevYears] = useState(false);
  const [form, setForm] = useState({
    name: category?.name ?? "",
    group: category?.group === "OTHER" ? "OTHER" : "PORTFOLIO",
    budget2024: moneyField(category?.budget2024 ?? null),
    budget2024v2: moneyField(category?.budget2024v2 ?? null),
    budget2025: moneyField(category?.budget2025 ?? null),
    usage2025: moneyField(category?.usage2025 ?? null),
    yearlyBudget: moneyField(category?.yearlyBudget ?? 0),
    worstCase: moneyField(category?.worstCase ?? null),
    reasoning: category?.reasoning ?? "",
    notes: category?.notes ?? "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const optMoney = (s: string): number | null => (s.trim() === "" ? null : Number(s));

  async function save() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      group: form.group,
      yearlyBudget: Number(form.yearlyBudget) || 0,
      budget2024: optMoney(form.budget2024),
      budget2024v2: optMoney(form.budget2024v2),
      budget2025: optMoney(form.budget2025),
      usage2025: optMoney(form.usage2025),
      worstCase: optMoney(form.worstCase),
      reasoning: form.reasoning.trim() || null,
      notes: form.notes.trim() || null,
    };
    const res = await fetch(editing ? `${base}/${category!.id}` : base, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.ok) onSaved();
    else toast.error((await res.json()).error ?? "Could not save category");
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
      <Input type="number" step="0.01" min="0" value={form[k] as string} onChange={set(k)} className="h-9" />
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
          <div className="grid grid-cols-2 gap-3">
            {numField("yearlyBudget", "2026 Budget")}
            {numField("worstCase", "Worst case")}
          </div>
          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setShowPrevYears((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium hover:bg-muted/50"
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${showPrevYears ? "rotate-90" : ""}`} />
              Previous years
            </button>
            {showPrevYears && (
              <div className="grid grid-cols-2 gap-3 border-t px-3 py-3">
                {numField("budget2024", "2024 Budget")}
                {numField("budget2024v2", "2024 Budget v2")}
                {numField("budget2025", "2025 Budget")}
                {numField("usage2025", "2025 Usage")}
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">Reasoning</Label>
            <Textarea value={form.reasoning} onChange={set("reasoning")} rows={4} />
          </div>
          <div>
            <Label className="text-xs">Questions / Notes</Label>
            <Textarea value={form.notes} onChange={set("notes")} rows={3} />
          </div>
          <p className="text-xs text-muted-foreground">2026 Usage is calculated live from classified treasury claims and can’t be edited here.</p>
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
