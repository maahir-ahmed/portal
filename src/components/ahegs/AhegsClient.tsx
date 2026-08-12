"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Download, Link2, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AHEGS_CATEGORIES,
  CATEGORY_LABELS,
  EVIDENCE_LABELS,
  EVIDENCE_REQUIRED,
  TEMPLATES,
  rowProblems,
  type RosterRow,
} from "@/lib/ahegs";
import type { AhegsCategory, AhegsEvidenceKind } from "@prisma/client";

interface Evidence {
  category: AhegsCategory;
  kind: AhegsEvidenceKind;
  url: string;
  label: string | null;
}

interface Submitter {
  name: string;
  zid: string;
  email: string;
  phone: string;
  position: string;
  club: string;
}

const cell = "w-full rounded border bg-background px-2 py-1 text-sm";

export function AhegsClient({
  societySlug,
  year,
  years,
  rows: initialRows,
  evidence: initialEvidence,
  submitter,
}: {
  societySlug: string;
  year: number;
  years: number[];
  rows: RosterRow[];
  evidence: Evidence[];
  submitter: Submitter;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [tab, setTab] = useState<AhegsCategory>("EXECUTIVE");
  const [busy, setBusy] = useState<string | null>(null);

  const base = `/api/societies/${societySlug}/ahegs`;

  // Every edit sends the whole row, so a save is idempotent and the server never has
  // to work out which field moved.
  async function save(row: RosterRow) {
    try {
      const res = await fetch(`${base}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...row, year }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  function edit(membershipId: string, patch: Partial<RosterRow>, persist = true) {
    const next = rows.map((r) => (r.membershipId === membershipId ? { ...r, ...patch, edited: true } : r));
    setRows(next);
    if (persist) {
      const row = next.find((r) => r.membershipId === membershipId);
      if (row) save(row);
    }
  }

  async function setEvidence_(category: AhegsCategory, kind: AhegsEvidenceKind, url: string | null, label?: string) {
    const key = `${category}-${kind}`;
    setBusy(key);
    try {
      const res = await fetch(`${base}/evidence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, category, kind, url, label: label ?? null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to save");
      setEvidence((prev) => [
        ...prev.filter((e) => !(e.category === category && e.kind === kind)),
        ...(url ? [{ category, kind, url, label: label ?? null }] : []),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(null);
    }
  }

  async function upload(category: AhegsCategory, kind: AhegsEvidenceKind, file: File) {
    const key = `${category}-${kind}`;
    setBusy(key);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
      const { url, name } = await res.json();
      await setEvidence_(category, kind, url, name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setBusy(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed: select and copy manually");
    }
  }

  const included = (category: AhegsCategory) => rows.filter((r) => r.included && r.category === category);
  const problemCount = (category: AhegsCategory) =>
    included(category).filter((r) => rowProblems(r).length > 0).length;
  const evidenceFor = (category: AhegsCategory, kind: AhegsEvidenceKind) =>
    evidence.find((e) => e.category === category && e.kind === kind);
  const evidenceDone = (category: AhegsCategory) =>
    EVIDENCE_REQUIRED[category].filter((k) => evidenceFor(category, k)).length;

  const arcFields: [string, string][] = [
    ["Submitter's name", submitter.name],
    ["Submitter's zID (without z)", submitter.zid],
    ["Submitter's email", submitter.email],
    ["Submitter's contact number", submitter.phone],
    ["Executive position", submitter.position],
    ["Club", submitter.club],
    ["Positions being submitted", AHEGS_CATEGORIES.map((c) => CATEGORY_LABELS[c]).join(", ")],
  ];

  return (
    <div className="space-y-6">
      {/* Readiness: what is still missing, before the deadline rather than during it. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="ahegs-year" className="text-sm text-muted-foreground">Year</label>
          <select
            id="ahegs-year"
            value={year}
            onChange={(e) => router.push(`/${societySlug}/ahegs?year=${e.target.value}`)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {AHEGS_CATEGORIES.map((category) => {
          const people = included(category);
          const problems = problemCount(category);
          const needed = EVIDENCE_REQUIRED[category].length;
          const have = evidenceDone(category);
          const ready = people.length > 0 && problems === 0 && have === needed;
          return (
            <Card key={category} className={cn(ready && "border-green-300 bg-green-50/40")}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{CATEGORY_LABELS[category]}</p>
                  {ready ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground tabnums">
                  {people.length} {people.length === 1 ? "person" : "people"}
                  {needed > 0 && ` · evidence ${have}/${needed}`}
                </p>
                {problems > 0 && (
                  <p className="text-xs text-red-600">
                    {problems} {problems === 1 ? "row needs" : "rows need"} fixing before submitting
                  </p>
                )}
                <Button asChild size="sm" variant="outline" className="w-full gap-1.5 text-xs" disabled={!people.length}>
                  <a href={`${base}/export?year=${year}&category=${category}`}>
                    <Download className="h-3.5 w-3.5" /> Download list
                  </a>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-1 border-b">
        {AHEGS_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === c ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {CATEGORY_LABELS[c]} ({included(c).length})
          </button>
        ))}
      </div>

      {/* Evidence for the category on screen. Executives need none. */}
      {EVIDENCE_REQUIRED[tab].length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {EVIDENCE_REQUIRED[tab].map((kind) => {
            const current = evidenceFor(tab, kind);
            const key = `${tab}-${kind}`;
            return (
              <Card key={kind}>
                <CardContent className="space-y-2 p-4">
                  <p className="text-sm font-semibold">{EVIDENCE_LABELS[kind].title}</p>
                  <p className="text-xs text-muted-foreground">{EVIDENCE_LABELS[kind].hint}</p>
                  {current ? (
                    <div className="flex items-center gap-2">
                      <a
                        href={current.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-xs text-blue-600 hover:underline"
                      >
                        {current.label || current.url}
                      </a>
                      <button
                        onClick={() => setEvidence_(tab, kind, null)}
                        disabled={busy === key}
                        aria-label="Remove"
                        className="text-muted-foreground hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs hover:bg-muted">
                        {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        Upload a file
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) upload(tab, kind, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const url = String(new FormData(e.currentTarget).get("url") ?? "").trim();
                          if (url) setEvidence_(tab, kind, url, "Link");
                        }}
                        className="flex gap-1"
                      >
                        <input name="url" placeholder="…or paste a link" className={cn(cell, "text-xs")} />
                        <Button type="submit" size="sm" variant="outline" className="px-2" disabled={busy === key}>
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Roster. Everything defaults from the member directory; edits stick. */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 p-2"></th>
              <th className="p-2 text-left font-medium">Full name (as per Student ID)</th>
              <th className="w-28 p-2 text-left font-medium">zID</th>
              <th className="p-2 text-left font-medium">Email</th>
              {TEMPLATES[tab].hasPosition && <th className="p-2 text-left font-medium">Position</th>}
              <th className="w-36 p-2 text-left font-medium">Start</th>
              <th className="w-36 p-2 text-left font-medium">End</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows
              .filter((r) => r.category === tab)
              .map((row) => {
                const problems = row.included ? rowProblems(row) : [];
                return (
                  <tr key={row.membershipId} className={cn(!row.included && "opacity-45")}>
                    <td className="p-2 align-top">
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={(e) => edit(row.membershipId, { included: e.target.checked })}
                        aria-label={`Include ${row.fullName}`}
                        className="mt-1.5 h-4 w-4"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={row.fullName}
                        onChange={(e) => edit(row.membershipId, { fullName: e.target.value }, false)}
                        onBlur={() => save(row)}
                        className={cell}
                      />
                      {problems.length > 0 && (
                        <p className="mt-1 text-xs text-red-600">{problems.join(" · ")}</p>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        value={row.zid}
                        onChange={(e) => edit(row.membershipId, { zid: e.target.value }, false)}
                        onBlur={() => save(row)}
                        placeholder="1234567"
                        className={cn(cell, "tabnums")}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={row.email}
                        onChange={(e) => edit(row.membershipId, { email: e.target.value }, false)}
                        onBlur={() => save(row)}
                        className={cell}
                      />
                    </td>
                    {TEMPLATES[tab].hasPosition && (
                      <td className="p-2">
                        <input
                          value={row.position}
                          onChange={(e) => edit(row.membershipId, { position: e.target.value }, false)}
                          onBlur={() => save(row)}
                          className={cell}
                        />
                      </td>
                    )}
                    <td className="p-2">
                      <input
                        type="date"
                        value={row.startDate}
                        onChange={(e) => edit(row.membershipId, { startDate: e.target.value })}
                        className={cell}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="date"
                        value={row.endDate}
                        onChange={(e) => edit(row.membershipId, { endDate: e.target.value })}
                        className={cell}
                      />
                    </td>
                  </tr>
                );
              })}
            {rows.filter((r) => r.category === tab).length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                  Nobody in the member directory falls into this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Arc's form asks for these about you before it asks for the lists. */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">Your details for Arc&apos;s form</p>
          <p className="text-xs text-muted-foreground">
            Click a value to copy it. Then upload the three lists above, plus the evidence files, and sign.
          </p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {arcFields.map(([label, value]) => (
              <button
                key={label}
                onClick={() => copy(value)}
                className="group flex items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="truncate text-sm">{value || <span className="text-red-600">not set</span>}</p>
                </div>
                <Copy className="mt-3 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
