"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, Check, Copy, Download, FileText, Layers, Link2, Loader2, Plus, Trash2, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import {
  AHEGS_CATEGORIES, CATEGORY_LABELS, EVIDENCE_LABELS, EVIDENCE_REQUIRED, TEMPLATES,
  documentCategories, groupLabel, rowProblems, type AhegsScope, type RosterRow,
} from "@/lib/ahegs";
import type { AhegsCategory, AhegsEvidenceKind } from "@prisma/client";

interface Evidence { category: AhegsCategory; kind: AhegsEvidenceKind; url: string; label: string | null }
interface Meeting {
  id: string; portfolioId: string | null; execTeam: boolean; title: string; date: string;
  hours: number; fileUrl: string | null; fileName: string | null; attendeeIds: string[];
}
interface Document {
  id: string; portfolioId: string | null; execTeam: boolean; kind: AhegsEvidenceKind;
  title: string; url: string; fileName: string | null; uploadedBy: string; createdAt: string;
}
interface Portfolio { id: string; name: string }
interface Submitter { name: string; zid: string; email: string; phone: string; position: string; club: string }

const cell = "w-full rounded border bg-background px-2 py-1 text-sm";

export function AhegsClient({
  societySlug, year, years, scope, rows: initialRows, meetings, documents,
  portfolios, evidence, submitter,
}: {
  societySlug: string; year: number; years: number[]; scope: AhegsScope;
  rows: RosterRow[]; meetings: Meeting[]; documents: Document[]; portfolios: Portfolio[];
  evidence: Evidence[]; submitter: Submitter;
}) {
  const router = useRouter();
  // The roster is the one thing held locally, because its inputs are controlled and
  // half of it is mid-edit at any moment. Everything else — meetings, documents,
  // evidence — is read straight off the props, so a router.refresh() after each
  // change is all that keeps the page current.
  const [rows, setRows] = useState(initialRows);
  const [seed, setSeed] = useState(initialRows);
  // Hours are summed on the server, so a logged meeting changes rows the browser
  // can't recompute. Re-seeding on the way back is what makes the refresh visible.
  if (seed !== initialRows) {
    setSeed(initialRows);
    setRows(initialRows);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [addingMeeting, setAddingMeeting] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [minutesFile, setMinutesFile] = useState<File | null>(null);
  const [meetingScope, setMeetingScope] = useState<string>(scope.portfolioId ?? "exec");
  const [addingDoc, setAddingDoc] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docKind, setDocKind] = useState<AhegsEvidenceKind>("TRAINING");
  // Unlike a meeting, an executive's document is usually club-wide material rather
  // than the exec team's own — Arc asks for no evidence behind the executive list.
  const [docScope, setDocScope] = useState<string>(scope.portfolioId ?? "");

  // A director only ever holds their own portfolio's rows, so any category with
  // nobody in it is noise on their screen.
  const visibleCategories = scope.isExec
    ? AHEGS_CATEGORIES
    : AHEGS_CATEGORIES.filter((c) => rows.some((r) => r.category === c));
  const [tab, setTab] = useState<AhegsCategory>(visibleCategories[0] ?? "SUBCOMMITTEE");

  const base = `/api/societies/${societySlug}/ahegs`;

  // Meetings and documents are both tagged with the group that produced them, so an
  // executive reads the pile a portfolio at a time. A director only ever holds one
  // group, which is why the headings appear only once there is more than one.
  function grouped<T extends { portfolioId: string | null; execTeam: boolean }>(items: T[]) {
    const byLabel = new Map<string, T[]>();
    for (const item of items) {
      const label = groupLabel(item, portfolios);
      const bucket = byLabel.get(label);
      if (bucket) bucket.push(item);
      else byLabel.set(label, [item]);
    }
    return [...byLabel].sort((a, b) => a[0].localeCompare(b[0]));
  }

  const meetingGroups = grouped(meetings);
  const documentGroups = grouped(documents);
  // Only worth labelling once the list spans more than one group, the same rule the
  // attendee picker uses.
  const groupHeading = (label: string, groups: unknown[]) =>
    groups.length > 1 ? (
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    ) : null;

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

  async function uploadFile(file: File, accept?: string): Promise<{ url: string; name: string }> {
    const body = new FormData();
    body.append("file", file);
    // Minutes and documents are PDF-only: they get merged into the single file Arc
    // asks for. Evidence an exec uploads by hand is whatever Arc will take.
    if (accept) body.append("accept", accept);
    const res = await fetch("/api/upload", { method: "POST", body });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
    return res.json();
  }

  async function addMeeting(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy("meeting");
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (minutesFile) {
        const up = await uploadFile(minutesFile, "pdf");
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
      setMinutesFile(null);
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
      const up = await uploadFile(file, "pdf");
      await send(`${base}/meetings/${id}`, "PATCH", { fileUrl: up.url, fileName: up.name });
      toast.success("Minutes attached");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function addDocument(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const link = String(form.get("url") ?? "").trim();
    if (!docFile && !link) {
      toast.error("Attach a PDF or paste a link");
      return;
    }
    setBusy("document");
    try {
      let url = link;
      let fileName: string | null = null;
      // A PDF can be folded into the combined file; a link can only be listed, which
      // is why the upload is the path the form nudges people down.
      if (docFile) {
        const up = await uploadFile(docFile, "pdf");
        url = up.url;
        fileName = up.name;
      }
      await send(`${base}/documents`, "POST", {
        year,
        kind: docKind,
        title: String(form.get("title") ?? "").trim(),
        url,
        fileName,
        portfolioId: scope.isExec && docScope !== "exec" ? docScope || null : null,
        execTeam: scope.isExec && docScope === "exec",
      });
      toast.success("Document added");
      setAddingDoc(false);
      setDocFile(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the document");
    } finally {
      setBusy(null);
    }
  }

  async function removeDocument(id: string) {
    if (!confirm("Remove this document? It drops out of the next combined file.")) return;
    setBusy(id);
    try {
      await send(`${base}/documents/${id}`, "DELETE");
      toast.success("Document removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(null);
    }
  }

  async function setEvidenceSlot(category: AhegsCategory, kind: AhegsEvidenceKind, url: string | null, label?: string) {
    const key = `${category}-${kind}`;
    setBusy(key);
    try {
      await send(`${base}/evidence`, "PUT", { year, category, kind, url, label: label ?? null });
      router.refresh();
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
  const categoryOf = new Map(rows.map((r) => [r.membershipId, r.category]));

  /**
   * What would go into one slot's combined file: the minutes of every meeting someone
   * in that category attended, plus the documents whose group contains that category.
   * Training is uploaded rather than attended, so no minutes feed it. Linked files are
   * left out — the server does not fetch other people's URLs, so it can't merge them.
   */
  const sourcesFor = (c: AhegsCategory, k: AhegsEvidenceKind) => {
    const fromMeetings =
      k === "TRAINING"
        ? []
        : meetings.filter(
            (m) => m.fileUrl?.startsWith("/uploads/") && m.attendeeIds.some((id) => categoryOf.get(id) === c)
          );
    const fromDocuments = documents.filter(
      (d) => d.kind === k && d.url.startsWith("/uploads/") && documentCategories(d, rows).includes(c)
    );
    const groups = new Set([...fromMeetings, ...fromDocuments].map((x) => groupLabel(x, portfolios)));
    return { count: fromMeetings.length + fromDocuments.length, groups: groups.size };
  };

  // Arc wants one file per slot, so everything collected is stitched into it here
  // rather than someone combining PDFs by hand the night before the deadline.
  async function combineMinutes(category: AhegsCategory, kind: AhegsEvidenceKind) {
    const key = `${category}-${kind}`;
    setBusy(key);
    try {
      const r = await send(`${base}/merge`, "POST", { year, category, kind });
      router.refresh();
      toast.success(
        `Combined ${r.merged} document${r.merged === 1 ? "" : "s"} into ${r.pages} pages` +
          (r.skipped?.length ? ` · skipped ${r.skipped.length}` : "")
      );
      if (r.skipped?.length) toast.warning(`Left out (linked or unreadable): ${r.skipped.join(", ")}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not combine the documents");
    } finally {
      setBusy(null);
    }
  }
  const evidenceFor = (c: AhegsCategory, k: AhegsEvidenceKind) =>
    evidence.find((e) => e.category === c && e.kind === k);
  const tabRows = rows.filter((r) => r.category === tab);
  // Whoever the chosen group actually contains: the executives (who hold no
  // portfolio), one portfolio, or the whole committee. A director's rows are already
  // only their own portfolio, so there is nothing left to filter.
  const choicesFor = (group: string) =>
    rows.filter((r) => {
      if (!scope.isExec) return true;
      if (group === "exec") return r.portfolioId === null;
      if (group === "") return true;
      return r.portfolioId === group;
    });
  const attendeeChoices = choicesFor(meetingScope);

  // Most meetings are attended by the whole group, so start with everyone ticked and
  // let the person logging it untick whoever was missing. The whole-committee list is
  // the exception: nobody sits through all of those, so it starts empty.
  const defaultAttendees = (group: string) =>
    group === "" ? [] : choicesFor(group).map((r) => r.membershipId);

  // Executives hold no portfolio, so they are their own group in the picker.
  const attendeeGroups = [
    { label: "Executives", rows: attendeeChoices.filter((r) => r.portfolioId === null) },
    ...portfolios.map((p) => ({
      label: p.name,
      rows: attendeeChoices.filter((r) => r.portfolioId === p.id),
    })),
  ].filter((g) => g.rows.length > 0);

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
              <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                      onClick={() => { setAttendees(defaultAttendees(meetingScope)); setAddingMeeting(true); }}>
                <Plus className="h-3.5 w-3.5" /> Log a meeting
              </Button>
            )}
          </div>

          {addingMeeting && (
            <form onSubmit={addMeeting} className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="meeting-title" className="text-xs font-medium">Meeting name</label>
                  <input id="meeting-title" name="title" placeholder="e.g. CTF weekly" required maxLength={300} className={cell} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="meeting-date" className="text-xs font-medium">Date</label>
                  <input id="meeting-date" name="date" type="date" required
                         defaultValue={new Date().toISOString().slice(0, 10)} className={cell} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="meeting-hours" className="text-xs font-medium">Hours</label>
                  <input id="meeting-hours" name="hours" type="number" step="0.25" min="0" max="24"
                         defaultValue="1" required className={cn(cell, "tabnums")} />
                </div>
              </div>
              {scope.isExec && (
                <select
                  value={meetingScope}
                  onChange={(e) => { setMeetingScope(e.target.value); setAttendees(defaultAttendees(e.target.value)); }}
                  aria-label="Who met"
                  className={cell}
                >
                  <option value="exec">Executive team</option>
                  {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  <option value="">Whole committee</option>
                </select>
              )}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium">
                    Who attended ({attendees.length}/{attendeeChoices.length})
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setAttendees(
                        attendees.length === attendeeChoices.length
                          ? []
                          : attendeeChoices.map((r) => r.membershipId)
                      )
                    }
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {attendees.length === attendeeChoices.length ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="max-h-52 space-y-2 overflow-y-auto rounded border bg-background p-2">
                  {attendeeChoices.length === 0 && <p className="text-xs text-muted-foreground">Nobody to pick from.</p>}
                  {attendeeGroups.map((group) => (
                    <div key={group.label}>
                      {/* Only worth labelling once the picker spans more than one group. */}
                      {attendeeGroups.length > 1 && (
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {group.label}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {group.rows.map((r) => {
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
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {minutesFile ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate">{minutesFile.name}</span>
                    <button type="button" onClick={() => setMinutesFile(null)} aria-label="Remove minutes"
                            className="text-muted-foreground hover:text-red-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : (
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> Attach minutes
                    <input type="file" accept="application/pdf,.pdf" className="hidden"
                           onChange={(e) => setMinutesFile(e.target.files?.[0] ?? null)} />
                  </label>
                )}
                <Button type="submit" size="sm" disabled={busy === "meeting"}>
                  {busy === "meeting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save meeting"}
                </Button>
                <Button type="button" size="sm" variant="ghost"
                        onClick={() => { setAddingMeeting(false); setAttendees([]); setMinutesFile(null); }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No meetings logged for {year} yet.</p>
          ) : (
            <div className="space-y-3">
              {meetingGroups.map(([label, items]) => (
                <div key={label}>
                  {groupHeading(label, meetingGroups)}
                  <div className="divide-y rounded-lg border">
                    {items.map((m) => (
                      <div key={m.id} className="flex flex-wrap items-center gap-3 p-2.5 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{m.title}</p>
                          <p className="text-xs text-muted-foreground tabnums">
                            {formatDate(m.date)} · {m.hours}h · {m.attendeeIds.length} attended
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
                            <input type="file" accept="application/pdf,.pdf" className="hidden"
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Everything a group hands up that isn't a set of minutes: training material,
          attendance records, schedules, reports. */}
      <Card data-tour="ahegs-documents">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Supporting documents</p>
              <p className="text-xs text-muted-foreground">
                {scope.isExec
                  ? "What every group has handed up. The evidence cards below combine these, and the minutes, into the files Arc receives."
                  : "Training material, attendance records, schedules and reports for your portfolio. An executive combines them into the files Arc receives."}
              </p>
            </div>
            {!addingDoc && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setAddingDoc(true)}>
                <Plus className="h-3.5 w-3.5" /> Add a document
              </Button>
            )}
          </div>

          {addingDoc && (
            <form onSubmit={addDocument} className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="doc-title" className="text-xs font-medium">What is it</label>
                  <input id="doc-title" name="title" required maxLength={300}
                         placeholder="e.g. CTF onboarding slides" className={cell} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="doc-kind" className="text-xs font-medium">Evidence for</label>
                  <select id="doc-kind" value={docKind} className={cell}
                          onChange={(e) => setDocKind(e.target.value as AhegsEvidenceKind)}>
                    {(["TRAINING", "ATTENDANCE", "COMMITMENT"] as AhegsEvidenceKind[]).map((k) => (
                      <option key={k} value={k}>{EVIDENCE_LABELS[k].title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{EVIDENCE_LABELS[docKind].hint}</p>
              {scope.isExec && (
                <select value={docScope} onChange={(e) => setDocScope(e.target.value)}
                        aria-label="Whose document" className={cell}>
                  <option value="exec">Executive team</option>
                  {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  <option value="">Whole committee</option>
                </select>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {docFile ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate">{docFile.name}</span>
                    <button type="button" onClick={() => setDocFile(null)} aria-label="Remove file"
                            className="text-muted-foreground hover:text-red-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : (
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> Attach a PDF
                    <input type="file" accept="application/pdf,.pdf" className="hidden"
                           onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
                  </label>
                )}
                <input name="url" placeholder="…or paste a link" className={cn(cell, "text-xs sm:w-56")} />
                <Button type="submit" size="sm" disabled={busy === "document"}>
                  {busy === "document" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save document"}
                </Button>
                <Button type="button" size="sm" variant="ghost"
                        onClick={() => { setAddingDoc(false); setDocFile(null); }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded for {year} yet.</p>
          ) : (
            <div className="space-y-3">
              {documentGroups.map(([label, items]) => (
                <div key={label}>
                  {groupHeading(label, documentGroups)}
                  <div className="divide-y rounded-lg border">
                    {items.map((d) => {
                      const uploaded = d.url.startsWith("/uploads/");
                      return (
                        <div key={d.id} className="flex flex-wrap items-center gap-3 p-2.5 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{d.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {EVIDENCE_LABELS[d.kind].title} · {d.uploadedBy} · {formatDate(d.createdAt)}
                              {/* A link lives somewhere the server doesn't fetch from, so
                                  saying so here beats a surprise at merge time. */}
                              {!uploaded && " · link, attach it to Arc yourself"}
                            </p>
                          </div>
                          <a href={d.url} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            {uploaded ? <FileText className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                            {d.fileName || "open"}
                          </a>
                          <button onClick={() => removeDocument(d.id)} disabled={busy === d.id}
                                  aria-label="Delete document" className="text-muted-foreground hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
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

      {/* The files Arc actually receives, one per slot, built from everything above:
          an executive job. */}
      {scope.isExec && EVIDENCE_REQUIRED[tab].length > 0 && (
        <div data-tour="ahegs-evidence" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {EVIDENCE_REQUIRED[tab].map((kind) => {
            const current = evidenceFor(tab, kind);
            const key = `${tab}-${kind}`;
            const src = sourcesFor(tab, kind);
            // Same button either way, but rebuilding is the normal case: more meetings
            // and documents land all year after the first file was built.
            const combine = (variant: "outline" | "ghost") => (
              <Button type="button" size="sm" variant={variant} className="w-full gap-1.5 text-xs"
                      disabled={busy === key} onClick={() => combineMinutes(tab, kind)}>
                {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                {current ? "Rebuild" : "Combine"} {src.count} file{src.count === 1 ? "" : "s"}
                {src.groups > 1 && ` from ${src.groups} groups`}
              </Button>
            );
            return (
              <Card key={kind}>
                <CardContent className="space-y-2 p-4">
                  <p className="text-sm font-semibold">{EVIDENCE_LABELS[kind].title}</p>
                  <p className="text-xs text-muted-foreground">{EVIDENCE_LABELS[kind].hint}</p>
                  {current ? (
                    <div className="space-y-2">
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
                      {src.count > 0 && combine("ghost")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {src.count > 0 && combine("outline")}
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
