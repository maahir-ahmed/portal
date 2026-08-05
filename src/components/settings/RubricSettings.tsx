"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { useRubricClient } from "@/hooks/useRubricClient";

interface RubricStatus {
  configured: boolean;
  rubricSocietyId: string | null;
  sessionConfigured: boolean;
  sessionAgeDays: number | null;
  sessionMaxAgeDays: number;
  sessionExpiring: boolean;
}

interface RubricSettingsProps {
  societySlug: string;
}

export function RubricSettings({ societySlug }: RubricSettingsProps) {
  const rubric = useRubricClient(societySlug);
  const [status, setStatus] = useState<RubricStatus | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [societyId, setSocietyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(
    () =>
      fetch(`/api/societies/${societySlug}/rubric/credentials`)
        .then((r) => r.json())
        .then(setStatus)
        .catch(() => {}),
    [societySlug]
  );

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleSave() {
    if (!sessionId || !societyId) {
      toast.error("Both Session ID and Society ID are required");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/societies/${societySlug}/rubric/credentials`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rubricSessionId: sessionId, rubricSocietyId: societyId }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Rubric credentials saved");
      setSessionId("");
      setSocietyId("");
      await loadStatus();
    } else {
      toast.error("Failed to save credentials");
    }
  }

  // Revocation. Rubric expires a session after about a month and rotation keeps it
  // alive, so "wait it out" is not an incident response; this is the kill switch.
  async function handleDisconnect() {
    if (!confirm("Disconnect Rubric? The stored session is deleted and every Rubric tab stops working until a new one is saved.")) return;
    setDisconnecting(true);
    const res = await fetch(`/api/societies/${societySlug}/rubric/credentials`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rubricSessionId: null }),
    });
    setDisconnecting(false);
    if (res.ok) {
      toast.success("Rubric disconnected. The stored session has been deleted.");
      await loadStatus();
    } else {
      toast.error("Failed to disconnect");
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    try {
      // Goes through our proxy, which is also how every other Rubric call runs, so a
      // pass here proves the server can reach Rubric with the stored session.
      await rubric.call({ type: "getSocietyPortalMembershipHomePage" });
      toast.success("Connected to Rubric successfully! Your session is working.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      toast.error(`${msg}. Check your credentials or refresh your Rubric session`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card data-tour="settings-rubric">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Rubric Integration</span>
          <a
            href="https://hellorubric.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground font-normal flex items-center gap-1 hover:underline"
          >
            hellorubric.com <ExternalLink className="h-3 w-3" />
          </a>
        </CardTitle>
        <CardDescription>
          Connect your Rubric account to submit events directly from this platform.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Connection status */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border">
          {status === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : status.configured ? (
            <>
              {status.sessionExpiring ? (
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              )}
              <div className="text-sm">
                <p className={`font-medium ${status.sessionExpiring ? "text-amber-800" : "text-green-800"}`}>
                  Rubric credentials saved
                </p>
                <p className="text-muted-foreground">
                  Society ID: {status.rubricSocietyId}
                  {status.sessionAgeDays !== null && (
                    <>
                      {" · session saved "}
                      {status.sessionAgeDays === 0 ? "today" : `${status.sessionAgeDays} day${status.sessionAgeDays === 1 ? "" : "s"} ago`}
                      {status.sessionExpiring && ` — Rubric expires sessions after about ${status.sessionMaxAgeDays} days, save a fresh one`}
                    </>
                  )}
                </p>
              </div>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-gray-400 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-gray-600">Not configured</p>
                <p className="text-muted-foreground">Enter your Rubric credentials below to enable event submission.</p>
              </div>
            </>
          )}
        </div>

        {/* Credential inputs */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="rubric-session">Session ID</Label>
            <Input
              id="rubric-session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder={status?.sessionConfigured ? "••••••••••••••• (already set)" : "Your Rubric sessionid"}
              type="password"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Found in your browser DevTools (Network tab) when logged into the Rubric portal. Stored server side
              and never sent back to a browser; this app makes every Rubric call for you. Rotates automatically.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rubric-society">Society ID</Label>
            <Input
              id="rubric-society"
              value={societyId}
              onChange={(e) => setSocietyId(e.target.value)}
              placeholder={status?.rubricSocietyId ?? "Numeric society ID from Rubric"}
            />
            <p className="text-xs text-muted-foreground">
              The integer ID of your society on the Rubric platform (e.g. 12686).
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving || (!sessionId && !societyId)}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Save Credentials"}
          </Button>
          {status?.configured && (
            <>
              <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
                {testing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing…</> : "Test Connection"}
              </Button>
              <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting} className="text-destructive hover:text-destructive">
                {disconnecting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Disconnecting…</> : "Disconnect"}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
