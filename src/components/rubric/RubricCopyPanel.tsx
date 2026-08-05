"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ClipboardList, ExternalLink } from "lucide-react";
import { ActivityGrantStatus } from "@prisma/client";
import { cn, statusLabel } from "@/lib/utils";

export interface CopyRecord {
  id: string;
  title: string;
  fields: { label: string; value: string }[];
}

// Activity-grant records carry a per-event grant status plus an optional link
// to the Rubric attendance page (the list must be attached to the Arc form).
export interface GrantRecord extends CopyRecord {
  status: string;
  attendanceHref?: string;
}

const GRANT_STATUSES = Object.values(ActivityGrantStatus);

type Tab = "room" | "printing" | "grants";

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
  grants: GrantRecord[];
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
  // When the grants tab is active, `records` IS `grants`, so the record is the grant.
  const grant = tab === "grants" ? (record as GrantRecord | undefined) : undefined;

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

  async function updateGrantStatus(requestId: string, status: string) {
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/societies/${societySlug}/content-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityGrantStatus: status }),
      });
      if (res.ok) {
        toast.success(`Grant marked ${statusLabel(status).toLowerCase()}`);
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Failed to update grant status");
      }
    } catch {
      toast.error("Failed to update grant status");
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
    grants: "events with a Rubric event attached",
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
            {grant && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Grant status</label>
                <select
                  value={grant.status}
                  onChange={(e) => updateGrantStatus(grant.id, e.target.value)}
                  disabled={savingStatus}
                  className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
                >
                  {GRANT_STATUSES.map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </select>
              </div>
            )}
            {grant?.attendanceHref && (
              <Link
                href={grant.attendanceHref}
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
