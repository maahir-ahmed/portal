"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DoorOpen } from "lucide-react";

/**
 * The room Arc actually gave us. Only rendered once the booking is approved — the
 * server enforces the same rule, so this is the affordance, not the guard.
 */
export function BookedRoomCard({
  societySlug,
  bookingId,
  assignedRoom,
  status,
  canEdit,
}: {
  societySlug: string;
  bookingId: string;
  assignedRoom: string | null;
  status: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(assignedRoom ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== (assignedRoom ?? "");

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/societies/${societySlug}/room-bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedRoom: value.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      // Recording the room closes the booking, so say so rather than letting the
      // status badge change behind them.
      const updated = await res.json().catch(() => null);
      const completed = updated?.status === "COMPLETED" && status !== "COMPLETED";
      toast.success(
        !value.trim()
          ? "Booked room cleared"
          : completed
            ? "Booked room saved · booking marked completed"
            : "Booked room saved"
      );
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Could not save the booked room");
    }
  }

  return (
    <Card className="border-green-200 bg-green-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DoorOpen className="h-4 w-4 text-green-700" /> Booked Room
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {canEdit ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (dirty) save();
            }}
          >
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. Ainsworth 202"
              aria-label="Booked room"
              maxLength={120}
            />
            <Button type="submit" size="sm" disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        ) : (
          <p className="text-sm">
            {assignedRoom || <span className="text-muted-foreground">Not recorded yet</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
