"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UpdateStatus } from "@/lib/updates";

type Status = Omit<UpdateStatus, "requestedAt" | "resultAt"> & { requestedAt: string | null; resultAt: string | null };

const when = (d: string) => new Date(d).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });

export const RESULT_TEXT: Record<string, string> = {
  ok: "Updated",
  failed: "The update didn't finish",
  rolled_back: "The new version didn't start, so the portal went back to the one before",
};

/** Settings > General: the version, whether a newer one is out, and "Update now". */
export function UpdatesCard({ societySlug }: { societySlug: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const load = () =>
    fetch(`/api/societies/${societySlug}/updates`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [societySlug]);

  async function updateNow() {
    setSending(true);
    const res = await fetch(`/api/societies/${societySlug}/updates`, { method: "POST" });
    setSending(false);
    setConfirming(false);
    if (res.ok) {
      toast.success("Update requested. The server picks it up within 5 minutes.");
      load();
    } else {
      toast.error((await res.json().catch(() => null))?.error ?? "Couldn't request the update");
    }
  }

  // Hidden on a stack that doesn't update itself (the hosted ones deploy from GitHub).
  if (!status?.enabled) return null;

  return (
    <Card id="updates" className="scroll-mt-4">
      <CardHeader>
        <CardTitle className="text-base">Version and updates</CardTitle>
        <CardDescription>
          New releases install on their own each night, after a backup. You can also update straight away.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          Running <strong>{status.current}</strong>
          {status.latest && !status.available && ", the newest release"}
          {status.available && (
            <>
              . Version <strong>{status.latest}</strong> is available.
            </>
          )}
        </p>
        {status.result && status.resultAt && (
          <p className={status.result === "ok" ? "text-muted-foreground" : "text-red-600"}>
            {RESULT_TEXT[status.result] ?? status.result} ({when(status.resultAt)})
            {status.result !== "ok" && status.resultDetail && `: ${status.resultDetail}`}
          </p>
        )}
        {!status.updaterRunning && (
          <p className="text-amber-700">
            The server&apos;s updater hasn&apos;t checked in lately, so nothing will install. On the server, run{" "}
            <code className="rounded bg-muted px-1">./portal autoupdate on</code>.
          </p>
        )}
        {status.requestedAt ? (
          <p className="text-muted-foreground">
            Update requested {when(status.requestedAt)}. The portal will restart for a minute or two while it installs.
          </p>
        ) : (
          <Button onClick={() => setConfirming(true)} disabled={!status.updaterRunning || !status.available}>
            Update now
          </Button>
        )}
      </CardContent>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update to {status.latest}?</DialogTitle>
            <DialogDescription>
              The server backs up the database and uploads first, then installs the new version. The portal is
              unavailable for a minute or two, so pick a quiet moment. If the new version doesn&apos;t start, it goes
              back to this one on its own.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={updateNow} disabled={sending}>
              {sending ? "Requesting…" : "Update now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
