"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { statusLabel } from "@/lib/utils";

interface Member {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface StatusUpdaterProps {
  currentStatus: string;
  statuses: string[];
  apiPath: string;
  members?: Member[];
  assignedToId?: string | null;
}

export function StatusUpdater({
  currentStatus,
  statuses,
  apiPath,
  members = [],
  assignedToId,
}: StatusUpdaterProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [assignedTo, setAssignedTo] = useState(assignedToId ?? "__none__");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        assignedToId: assignedTo === "__none__" ? null : assignedTo,
      }),
    });
    setSaving(false);

    if (res.ok) {
      toast.success("Updated successfully");
      router.refresh();
    } else {
      toast.error("Failed to update");
    }
  }

  return (
    <Card data-tour="status-updater">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Manage Request</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {members.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Assign to</label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size="sm" />
                      {m.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button onClick={save} disabled={saving} size="sm" className="w-full">
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
