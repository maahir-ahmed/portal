"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, Check, Copy, Download, FileText, Link2, Loader2, Plus, Trash2, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import {
  AHEGS_CATEGORIES, CATEGORY_LABELS, EVIDENCE_LABELS, EVIDENCE_REQUIRED, TEMPLATES,
  rowProblems, type AhegsScope, type RosterRow,
} from "@/lib/ahegs";
import type { AhegsCategory, AhegsEvidenceKind } from "@prisma/client";

interface Evidence { category: AhegsCategory; kind: AhegsEvidenceKind; url: string; label: string | null }
interface Meeting {
  id: string; portfolioId: string | null; execTeam: boolean; title: string; date: string;
  hours: number; fileUrl: string | null; fileName: string | null; attendeeIds: string[];
}
interface Portfolio { id: string; name: string }
interface Submitter { name: string; zid: string; email: string; phone: string; position: string; club: string }

const cell = "w-full rounded border bg-background px-2 py-1 text-sm";

export function AhegsClient({
  societySlug, year, years, scope, rows: initialRows, meetings: initialMeetings,
  portfolios, evidence: initialEvidence, submitter,
}: {
  societySlug: string; year: number; years: number[]; scope: AhegsScope;
  rows: RosterRow[]; meetings: Meeting[]; portfolios: Portfolio[];
  evidence: Evidence[]; submitter: Submitter;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [busy, setBusy] = useState<string | null>(null);
  const [addingMeeting, setAddingMeeting] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [meetingScope, setMeetingScope] = useState<string>(scope.portfolioId ?? "exec");

  // A director only ever holds their own portfolio's rows, so any category with
  // nobody in it is noise on their screen.
  const visibleCategories = scope.isExec
    ? AHEGS_CATEGORIES
    : AHEGS_CATEGORIES.filter((c) => rows.some((r) => r.category === c));
  const [tab, setTab] = useState<AhegsCategory>(visibleCategories[0] ?? "SUBCOMMITTEE");

  const base = `/api/societies/${societySlug}/ahegs`;
  const meetingGroupName = (m: { portfolioId: string | null; execTeam: boolean }) =>
    m.execTeam
      ? "Executive team"
      : m.portfolioId
        ? (portfolios.find((p) => p.id === m.portfolioId)?.name ?? "Unknown")
        : "Whole committee";

  async function send(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
    return res.json().catch(() => ({}));
  }

  // Every edit sends the whole row, so a save is idempotent and the server never has
  // to work out which field moved.
  async function save(row: RosterRow) {
    try {
      await send(`${base}/entries`, "PUT", { ...row, year });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  function edit(membershipId: string, patch: Partial<RosterRow>, persist = true) {
    const next = rows.map((r) => {
      if (r.membershipId !== membershipId) return r;
      const merged = { ...r, ...patch, edited: true };
      merged.totalHours = Math.round((merged.meetingHours + (merged.hoursAdjustment ?? 0)) * 100) / 100;
      return merged;
    });
    setRows(next);
    if (persist) {
      const row = next.find((r) => r.membershipId === membershipId);
      if (row) save(row);
    }
  }

  async function uploadFile(file: File): Promise<{ url: string; name: string }> {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
    return res.json();
  }

  async function addMeeting(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("minutes") as File | null;
    setBusy("meeting");
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (file && file.size > 0) {
        const up = await uploadFile(file);
        fileUrl = up.url;
        fileName = up.name;
      }
      await send(`${base}/meetings`, "POST", {
        year,
        title: String(form.get("title") ?? "").trim(),
        date: String(form.get("date") ?? ""),
        hours: Number(form.get("hours")),
        portfolioId: scope.isExec && meetingScope !== "exec" ? meetingScope || null : null,
        execTeam: scope.isExec && meetingScope === "exec",
        fileUrl,
        fileName,
        attendeeIds: attendees,
      });
      toast.success("Meeting logged");
      setAddingMeeting(false);
      setAttendees([]);
      // Hours are summed server-side, so the whole roster re-reads rather than
      // guessing at the new totals here.
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not log the meeting");
    } finally {
      setBusy(null);
    }
  }

  async function removeMeeting(id: string) {
    if (!confirm("Delete this meeting? Everyone who attended loses those hours.")) return;
    setBusy(id);
    try {
      await send(`${base}/meetings/${id}`, "DELETE");
      toast.success("Meeting deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(null);
    }
  }

  async function attachMinutes(id: string, file: File) {
    setBusy(id);
    try {
      const up = await uploadFile(file);
      await send(`${base}/meetings/${id}`, "PATCH", { fileUrl: up.url, fileName: up.name });
      toast.success("Minutes attached");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function setEvidenceSlot(category: AhegsCategory, kind: AhegsEvidenceKind, url: string | null, label?: string) {
    const key = `${category}-${kind}`;
    setBusy(key);
    try {
      await send(`${base}/evidence`, "PUT", { year, category, kind, url, label: label ?? null });
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

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed: select and copy manually");
    }
  }

  const included = (c: AhegsCategory) => rows.filter((r) => r.included && r.category === c);
  const evidenceFor = (c: AhegsCategory, k: AhegsEvidenceKind) =>
    evidence.find((e) => e.category === c && e.kind === k);
  const tabRows = rows.filter((r) => r.category === tab);
  // Attendees are picked from whoever the chosen group actually contains: the
  // executives (who hold no portfolio), one portfolio, or the whole committee.
  const attendeeChoices = rows.filter((r) => {
    if (!scope.isExec) return true;
    if (meetingScope === "exec") return r.portfolioId === null;
    if (meetingScope === "") return true;
    return r.portfolioId === meetingScope;
  });

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
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ahegs-year" className="text-sm text-muted-foreground">Year</label>
        <select
          id="ahegs-year"
          value={year}
          onChange={(e) => router.push(`/${societySlug}/ahegs?year=${e.target.value}`)}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {!scope.isExec && (
          <span className="text-sm text-muted-foreground">
            · {portfolios.find((p) => p.id === scope.portfolioId)?.name ?? "no"} portfolio
          </span>
        )}
      </div>

      {/* Readiness, and the downloads Arc wants: the executives' job. */}
      {scope.isExec && (
        <div data-tour="ahegs-ready" className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {AHEGS_CATEGORIES.map((category) => {
            const people = included(category);
            const problems = people.filter((r) => rowProblems(r).length > 0).length;
            const needed = EVIDENCE_REQUIRED[category].length;
            const have = EVIDENCE_REQUIRED[category].filter((k) => evidenceFor(category, k)).length;
            const ready = people.length > 0 && problems === 0 && have === needed;
            return (
              <Card key={category} className={cn(ready && "border-green-300 bg-green-50/40")}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{CATEGORY_LABELS[category]}</p>
                    {ready ? <Check className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
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
      )}

      {/* Meetings and minutes. Directors log their own portfolio; hours follow. */}
      <Card data-tour="ahegs-meetings">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Meetings &amp; minutes</p>
              <p className="text-xs text-muted-foreground">
                Hours are summed from who attended, so the minutes are the proof behind every number.
              </p>
            </div>
            {!addingMeeting && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setAddingMeeting(true)}>
                <Plus className="h-3.5 w-3.5" /> Log a meeting
              </Button>
            )}
          </div>

          {addingMeeting && (
            <form onSubmit={addMeeting} className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <input name="title" placeholder="Meeting name" required maxLength={300} className={cn(cell, "sm:col-span-2")} />
                <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={cell} />
                <input name="hours" type="number" step="0.25" min="0" max="24" defaultValue="1" required aria-label="Hours" className={cell} />
              </div>
              {scope.isExec && (
                <select
                  value={meetingScope}
                  onChange={(e) => { setMeetingScope(e.target.value); setAttendees([]); }}
                  aria-label="Who met"
                  className={cell}
                >
                  <option value="exec">Executive team</option>
                  {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  <option value="">Whole committee</option>
                </select>
              )}
              <div>
                <p className="mb-1 text-xs font-medium">Who attended ({attendees.length})</p>
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded border bg-background p-2">
                  {attendeeChoices.length === 0 && <p className="text-xs text-muted-foreground">Nobody to pick from.</p>}
                  {attendeeChoices.map((r) => {
                    const on = attendees.includes(r.membershipId);
                    return (
                      <button
                        key={r.membershipId}
                        type="button"
                        onClick={() =>
                          setAttendees(on ? attendees.filter((a) => a !== r.membershipId) : [...attendees, r.membershipId])
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                        )}
                      >
                        {on && <Check className="mr-1 inline h-3 w-3" />}
                        {r.fullName}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" /> Attach minutes
                  <input type="file" name="minutes" className="hidden" />
                </label>
                <Button type="submit" size="sm" disabled={busy === "meeting"}>
                  {busy === "meeting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save meeting"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingMeeting(false); setAttendees([]); }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {initialMeetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No meetings logged for {year} yet.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {initialMeetings.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-3 p-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.title}</p>
                    <p className="text-xs text-muted-foreground tabnums">
                      {formatDate(m.date)} · {m.hours}h · {m.attendeeIds.length} attended
                      {scope.isExec && ` · ${meetingGroupName(m)}`}
                    </p>
                  </div>
                  {m.fileUrl ? (
                    <a href={m.fileUrl} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <FileText className="h-3.5 w-3.5" /> {m.fileName || "minutes"}
                    </a>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      add minutes
                      <input type="file" className="hidden"
                             onChange={(e) => { const f = e.target.files?.[0]; if (f) attachMinutes(m.id, f); e.target.value = ""; }} />
                    </label>
                  )}
                  <button onClick={() => removeMeeting(m.id)} disabled={busy === m.id}
                          aria-label="Delete meeting" className="text-muted-foreground hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-1 border-b">
        {/* Sub-Committee is always last, and is the tab the tour's evidence step opens. */}
        {visibleCategories.map((c, i) => (
          <button key={c} onClick={() => setTab(c)}
            data-tour={i === visibleCategories.length - 1 ? "ahegs-tab-subcom" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === c ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {CATEGORY_LABELS[c]} ({included(c).length})
          </button>
        ))}
      </div>

      {/* Arc's supporting documents, combined per category: an executive job. */}
      {scope.isExec && EVIDENCE_REQUIRED[tab].length > 0 && (
        <div data-tour="ahegs-evidence" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
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
                      <a href={current.url} target="_blank" rel="noopener noreferrer"
                         className="min-w-0 flex-1 truncate text-xs text-blue-600 hover:underline">
                        {current.label || current.url}
                      </a>
                      <button onClick={() => setEvidenceSlot(tab, kind, null)} disabled={busy === key}
                              aria-label="Remove" className="text-muted-foreground hover:text-red-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs hover:bg-muted">
                        {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        Upload a file
                        <input type="file" className="hidden"
                               onChange={async (e) => {
                                 const f = e.target.files?.[0];
                                 e.target.value = "";
                                 if (!f) return;
                                 setBusy(key);
                                 try { const up = await uploadFile(f); await setEvidenceSlot(tab, kind, up.url, up.name); }
                                 catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); setBusy(null); }
                               }} />
                      </label>
                      <form onSubmit={(e) => {
                              e.preventDefault();
                              const url = String(new FormData(e.currentTarget).get("url") ?? "").trim();
                              if (url) setEvidenceSlot(tab, kind, url, "Link");
                            }} className="flex gap-1">
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

      {/* Roster. Defaults come from the member directory; edits stick. */}
      <div data-tour="ahegs-roster" className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 p-2"></th>
              <th className="p-2 text-left font-medium">Full name (as per Student ID)</th>
              <th className="w-28 p-2 text-left font-medium">zID</th>
              <th className="p-2 text-left font-medium">Email</th>
              {TEMPLATES[tab].hasPosition && <th className="p-2 text-left font-medium">Position</th>}
              <th className="w-32 p-2 text-left font-medium">Start</th>
              <th className="w-32 p-2 text-left font-medium">End</th>
              <th className="w-20 p-2 text-right font-medium">Meetings</th>
              <th className="w-20 p-2 text-right font-medium">Adjust</th>
              <th className="w-20 p-2 text-right font-medium">Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tabRows.map((row) => {
              const problems = row.included ? rowProblems(row) : [];
              return (
                <tr key={row.membershipId} className={cn(!row.included && "opacity-45")}>
                  <td className="p-2 align-top">
                    <input type="checkbox" checked={row.included}
                           onChange={(e) => edit(row.membershipId, { included: e.target.checked })}
                           aria-label={`Include ${row.fullName}`} className="mt-1.5 h-4 w-4" />
                  </td>
                  <td className="p-2">
                    <input value={row.fullName} onChange={(e) => edit(row.membershipId, { fullName: e.target.value }, false)}
                           onBlur={() => save(row)} className={cell} />
                    {problems.length > 0 && <p className="mt-1 text-xs text-red-600">{problems.join(" · ")}</p>}
                  </td>
                  <td className="p-2">
                    <input value={row.zid} onChange={(e) => edit(row.membershipId, { zid: e.target.value }, false)}
                           onBlur={() => save(row)} placeholder="1234567" className={cn(cell, "tabnums")} />
                  </td>
                  <td className="p-2">
                    <input value={row.email} onChange={(e) => edit(row.membershipId, { email: e.target.value }, false)}
                           onBlur={() => save(row)} className={cell} />
                  </td>
                  {TEMPLATES[tab].hasPosition && (
                    <td className="p-2">
                      <input value={row.position} onChange={(e) => edit(row.membershipId, { position: e.target.value }, false)}
                             onBlur={() => save(row)} className={cell} />
                    </td>
                  )}
                  <td className="p-2">
                    <input type="date" value={row.startDate}
                           onChange={(e) => edit(row.membershipId, { startDate: e.target.value })} className={cell} />
                  </td>
                  <td className="p-2">
                    <input type="date" value={row.endDate}
                           onChange={(e) => edit(row.membershipId, { endDate: e.target.value })} className={cell} />
                  </td>
                  <td className="p-2 text-right text-xs text-muted-foreground tabnums" title="From meetings attended">
                    {row.meetingHours}h
                    <span className="block text-[10px]">{row.meetingCount} mtg{row.meetingCount === 1 ? "" : "s"}</span>
                  </td>
                  <td className="p-2">
                    <input type="number" step="0.25" value={row.hoursAdjustment ?? ""} placeholder="0"
                           title="Hours for work outside meetings"
                           onChange={(e) => edit(row.membershipId, { hoursAdjustment: e.target.value === "" ? null : Number(e.target.value) }, false)}
                           onBlur={() => save(row)} className={cn(cell, "tabnums text-right")} />
                  </td>
                  <td className="p-2 text-right font-medium tabnums">{row.totalHours}h</td>
                </tr>
              );
            })}
            {tabRows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-sm text-muted-foreground">
                  {scope.isExec
                    ? "Nobody in the member directory falls into this category."
                    : "Nobody in your portfolio falls into this category."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {scope.isExec && (
        <Card data-tour="ahegs-arc">
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">Your details for Arc&apos;s form</p>
            <p className="text-xs text-muted-foreground">
              Click a value to copy it. Then upload the three lists above, plus the evidence files, and sign.
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {arcFields.map(([label, value]) => (
                <button key={label} onClick={() => copy(value)}
                        className="group flex items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/60">
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
      )}
    </div>
  );
}
