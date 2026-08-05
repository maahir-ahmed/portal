"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarSearch, Loader2 } from "lucide-react";
import { useRubricClient } from "@/hooks/useRubricClient";
import { flattenEvents, type RubricEvent } from "@/lib/rubricEvents";

interface Props {
  societySlug: string;
  contentRequestId: string;
  label?: string;
}

// Links a content request to an event that already exists on Rubric (fetched
// live from the portal), enabling the attendance list and activity grants.
// Also used to correct an accidental assignment; re-picking overwrites the link.
export function AssignRubricEvent({ societySlug, contentRequestId, label = "Assign existing Rubric event" }: Props) {
  const router = useRouter();
  const rubric = useRubricClient(societySlug);
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<RubricEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || events !== null) return;
    rubric.call({ type: "getSocietyPortalTicketingHomePage" })
      .then((d) => {
        const evs = flattenEvents(d);
        setEvents(evs);
        if (evs[0]?.eventid != null) setSelected(String(evs[0].eventid));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load events");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function assign() {
    const event = events?.find((e) => String(e.eventid) === selected);
    if (!event) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/societies/${societySlug}/rubric/submit-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentRequestId,
          rubricEventId: String(event.eventid),
          rubricEventLink: event.purchaseurl,
          markSubmitted: false,
        }),
      });
      if (res.ok) {
        toast.success("Rubric event assigned");
        setOpen(false);
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Failed to assign event");
      }
    } catch {
      toast.error("Failed to assign event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <CalendarSearch className="h-3.5 w-3.5" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign a Rubric event</DialogTitle>
          <DialogDescription>
            Link this request to an event already on Rubric; enables the attendance list and activity grant tracking.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : events === null ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events found on Rubric.</p>
        ) : (
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-2 text-sm"
          >
            {events.map((e) => (
              <option key={String(e.eventid)} value={String(e.eventid)}>
                {e.eventname ?? `Event ${e.eventid}`}
                {e.eventTime ? `, ${new Date(e.eventTime).toLocaleDateString("en-AU")}` : ""}
              </option>
            ))}
          </select>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={assign} disabled={saving || !selected || !events?.length}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Assigning…</> : "Assign event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
