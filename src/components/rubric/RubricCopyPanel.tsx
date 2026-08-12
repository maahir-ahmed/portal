"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ClipboardList, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoomBookingStatus } from "@prisma/client";

export interface CopyRecord {
  id: string;
  title: string;
  fields: { label: string; value: string }[];
  /** Room bookings only: their lifecycle status, so the panel knows if Arc still needs it. */
  status?: string;
  /** Grants only: the Rubric attendance page (its list must be attached to the Arc form). */
  attendanceHref?: string;
}

type Tab = "room" | "printing" | "grants";

// Room-booking statuses that haven't reached Arc yet. Past these, the booking is
// already lodged (or dead) and the button would only walk the status backwards.
const ROOM_UNSUBMITTED: RoomBookingStatus[] = ["SUBMITTED", "UNDER_REVIEW", "WAITING_ON_INFORMATION"];

// Shows room booking / printing / activity-grant details beside the embedded
// Rubric portal so the info can be copied field-by-field into Rubric's
// (cross-origin) web forms.
export function RubricCopyPanel({
  societySlug,
  bookings,
  printing,
  grants,
  initialTab = "room",
  initialId,
}: {
  societySlug: string;
  bookings: CopyRecord[];
  printing: CopyRecord[];
  grants: CopyRecord[];
  initialTab?: Tab;
  initialId?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [savingStatus, setSavingStatus] = useState(false);

  const byTab: Record<Tab, CopyRecord[]> = { room: bookings, printing, grants };
  const records = byTab[tab];
  const initialRecords = byTab[initialTab];
  const [id, setId] = useState<string>(
    initialId && initialRecords.some((r) => r.id === initialId) ? initialId : initialRecords[0]?.id ?? ""
  );
  const record = records.find((r) => r.id === id) ?? records[0];

  function switchTab(t: Tab) {
    setTab(t);
    setId(byTab[t][0]?.id ?? "");
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed: select and copy manually");
    }
  }

  // Each tab submits its record on Rubric's own site, then says so here. The three
  // endpoints already exist and already enforce exec-only; this is just the button
  // next to the form you filled, so the tab you are on is the tab you can tick off.
  const SUBMIT: Record<Tab, { label: string; done: string; confirm?: string; request: (id: string) => [string, RequestInit] }> = {
    room: {
      label: "Mark submitted to Arc",
      done: "Booking marked submitted to Arc",
      request: (id) => [
        `/api/societies/${societySlug}/room-bookings/${id}`,
        { method: "PATCH", body: JSON.stringify({ status: "SUBMITTED_TO_ARC" }) },
      ],
    },
    printing: {
      label: "Mark submitted to Arc",
      done: "Printing job marked submitted to Arc",
      request: (id) => [
        `/api/societies/${societySlug}/printing/${id}`,
        { method: "POST", body: JSON.stringify({ action: "mark_submitted" }) },
      ],
    },
    grants: {
      label: "Mark grant submitted",
      done: "Grant marked submitted",
      // The only one with no way back in the UI: a submitted grant leaves this list
      // and the event has no grant control of its own any more.
      confirm: "Mark this activity grant as submitted? It will disappear from this list.",
      request: (id) => [
        `/api/societies/${societySlug}/content-requests/${id}`,
        { method: "PATCH", body: JSON.stringify({ activityGrantStatus: "SUBMITTED" }) },
      ],
    },
  };

  // Room bookings stay listed after they are lodged; the other two tabs only ever
  // hold records that still need submitting.
  const canSubmit = !!record && (tab !== "room" || (ROOM_UNSUBMITTED as string[]).includes(record.status ?? ""));

  async function markSubmitted() {
    if (!record) return;
    const spec = SUBMIT[tab];
    if (spec.confirm && !confirm(spec.confirm)) return;
    setSavingStatus(true);
    try {
      const [url, init] = spec.request(record.id);
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      if (res.ok) {
        toast.success(spec.done);
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Failed to update");
      }
    } catch {
      toast.error("Failed to update");
    } finally {
      setSavingStatus(false);
    }
  }

  const TAB_LABELS: Record<Tab, string> = {
    room: `Room bookings (${bookings.length})`,
    printing: `Printing (${printing.length})`,
    grants: `Grants (${grants.length})`,
  };
  const EMPTY_LABELS: Record<Tab, string> = {
    room: "room bookings",
    printing: "printing requests awaiting Arc submission",
    grants: "events with a grant left to claim (they drop off 30 days after the event)",
  };

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-lg border bg-card lg:w-[360px] lg:flex-shrink-0">
      <div className="flex border-b">
        {(["room", "printing", "grants"] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={cn(
              "flex-1 px-2 py-2 text-sm font-medium transition-colors",
              tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {records.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No {EMPTY_LABELS[tab]} yet.</p>
      ) : (
        <>
          <div className="space-y-2 border-b p-3">
            <select
              value={record?.id ?? ""}
              onChange={(e) => setId(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {records.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
            {canSubmit && (
              <button
                onClick={markSubmitted}
                disabled={savingStatus}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                {savingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {SUBMIT[tab].label}
              </button>
            )}
            {tab === "room" && !canSubmit && (
              <p className="text-xs text-muted-foreground">Already submitted to Arc.</p>
            )}
            {tab === "grants" && record?.attendanceHref && (
              <Link
                href={record.attendanceHref}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Attendance list (CSV on event page)
              </Link>
            )}
            {record && (
              <button
                onClick={() => copy(record.fields.map((f) => `${f.label}: ${f.value}`).join("\n"))}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <ClipboardList className="h-3.5 w-3.5" /> Copy all fields
              </button>
            )}
          </div>

          <div className="flex-1 divide-y overflow-y-auto">
            {record?.fields.map((f, i) => (
              <button
                key={i}
                onClick={() => copy(f.value)}
                className="group flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/50"
                title="Click to copy"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</p>
                  <p className="whitespace-pre-wrap break-words text-sm">{f.value || "-"}</p>
                </div>
                <Copy className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
