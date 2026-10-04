"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { agmDate, FIRST_YEAR, term3End, type YearDates } from "@/lib/years";

interface Row {
  year: number;
  agmDate: string; // "YYYY-MM-DD" or "" for not set
  term3End: string;
}

const day = (d: string | null) => (d ? d.slice(0, 10) : "");

/**
 * The two dates per year that decide which year a claim, budget and AHEGS meeting
 * belong to. Unset dates fall back to a default (shown as the placeholder), so the
 * site keeps working before anyone fills this in.
 */
export function YearCalendarSettings({ societySlug }: { societySlug: string }) {
  const base = `/api/societies/${societySlug}/years`;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(base)
      .then((r) => (r.ok ? r.json() : []))
      .then((saved: { year: number; agmDate: string | null; term3End: string | null }[]) => {
        // Every year from the first the site keeps through next year, plus any saved.
        const now = new Date().getUTCFullYear();
        const years = new Set([
          ...Array.from({ length: Math.max(0, now + 1 - FIRST_YEAR + 1) }, (_, i) => FIRST_YEAR + i),
          ...saved.map((s) => s.year).filter((y) => y >= FIRST_YEAR),
        ]);
        setRows(
          [...years]
            .sort((a, b) => b - a)
            .map((year) => {
              const s = saved.find((x) => x.year === year);
              return { year, agmDate: day(s?.agmDate ?? null), term3End: day(s?.term3End ?? null) };
            })
        );
      })
      .catch(() => setRows([]));
  }, [base]);

  function update(year: number, field: "agmDate" | "term3End", value: string) {
    setRows((rs) => rs && rs.map((r) => (r.year === year ? { ...r, [field]: value } : r)));
  }

  async function save() {
    if (!rows) return;
    setSaving(true);
    const res = await fetch(base, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        years: rows.map((r) => ({ year: r.year, agmDate: r.agmDate || null, term3End: r.term3End || null })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      const { meetingsMoved } = await res.json();
      toast.success(
        meetingsMoved
          ? `Year dates saved. ${meetingsMoved} AHEGS ${meetingsMoved === 1 ? "meeting moves" : "meetings move"} to another year.`
          : "Year dates saved"
      );
    }
    else toast.error((await res.json().catch(() => ({}))).error ?? "Could not save the year dates");
  }

  // The defaults years.ts falls back to, to show in place of an empty field.
  const fallback: YearDates[] = [];

  return (
    <Card data-tour="settings-years">
      <CardHeader>
        <CardTitle className="text-base">Society year</CardTitle>
        <CardDescription>
          Treasury and the budget run AGM to AGM: the AGM in a year&apos;s Term 3 starts the next
          year&apos;s budget. AHEGS runs from the end of one Term 3 to the end of the next. Events
          go by calendar year and need neither date.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {rows.map((r) => (
              <div key={r.year} className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-[4rem_1fr_1fr] sm:items-start">
                <p className="pt-2 text-sm font-semibold tabnums">{r.year}</p>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">AGM date</span>
                  <Input
                    type="date"
                    value={r.agmDate}
                    min={`${r.year}-01-01`}
                    max={`${r.year}-12-31`}
                    onChange={(e) => update(r.year, "agmDate", e.target.value)}
                    aria-label={`${r.year} AGM date`}
                  />
                  <span className="block text-xs text-muted-foreground">
                    {r.agmDate ? "" : `Not set, using ${formatDate(agmDate(fallback, r.year))}. `}
                    Closes the {r.year} budget, opens {r.year + 1}
                  </span>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Term 3 ends</span>
                  <Input
                    type="date"
                    value={r.term3End}
                    min={`${r.year}-01-01`}
                    max={`${r.year}-12-31`}
                    onChange={(e) => update(r.year, "term3End", e.target.value)}
                    aria-label={`${r.year} Term 3 end date`}
                  />
                  <span className="block text-xs text-muted-foreground">
                    {r.term3End ? "" : `Not set, using ${formatDate(term3End(fallback, r.year))}. `}
                    Closes AHEGS {r.year}
                  </span>
                </label>
              </div>
            ))}
          </div>
        )}
        <Button onClick={save} disabled={saving || rows === null}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save year dates
        </Button>
      </CardContent>
    </Card>
  );
}
