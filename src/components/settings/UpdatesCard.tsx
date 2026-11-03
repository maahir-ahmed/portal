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

type Status = Omit<UpdateStatus, "requestedAt" | "resultAt" | "nextCheckAt"> & {
  requestedAt: string | null;
  resultAt: string | null;
  nextCheckAt: string | null;
};

const when = (d: string) => new Date(d).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });

export const RESULT_TEXT: Record<string, string> = {
  ok: "Updated",
  failed: "The update didn't finish",
  rolled_back: "The new version didn't start, so the portal went back to the one before",
};

/**
 * Settings > General: the version, whether a newer one is out, and a button to have the
 * server install it at its next nightly check. The server only checks once a day, so the
 * button can't be instant: it's for a release the night run skipped (one that failed to
 * start before) or a server that doesn't install releases by itself.
 */
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
      toast.success("Requested. The server installs it at its next check.");
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
          Each night the server checks for a new release and installs it, after a backup.
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
            Requested {when(status.requestedAt)}. It installs at the server&apos;s next check
            {status.nextCheckAt && `, around ${when(status.nextCheckAt)}`}, and the portal restarts for a minute or two.
          </p>
        ) : (
          status.available && (
            <>
              <p className="text-muted-foreground">
                The server&apos;s next check is
                {status.nextCheckAt ? ` around ${when(status.nextCheckAt)}` : " tonight"}. To install it straight
                away instead, run <code className="rounded bg-muted px-1">./portal update</code> on the server.
              </p>
              <Button onClick={() => setConfirming(true)} disabled={!status.updaterRunning}>
                Install at the next check
              </Button>
            </>
          )
        )}
      </CardContent>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install {status.latest} at the next check?</DialogTitle>
            <DialogDescription>
              At its next check{status.nextCheckAt && `, around ${when(status.nextCheckAt)}`}, the server backs up the
              database and uploads, then installs the new version, even one that failed to start before. The portal is
              unavailable for a minute or two. If the new version doesn&apos;t start, it goes back to this one on its
              own.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={updateNow} disabled={sending}>
              {sending ? "Requesting…" : "Install at the next check"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
