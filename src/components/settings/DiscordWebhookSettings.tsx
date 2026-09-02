"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Loader2, MessageSquare, Send, Trash2 } from "lucide-react";

/**
 * The webhook the exec queue posts to. The saved URL is never sent back here — the
 * server reports only whether one exists — so the field is always blank on load and
 * saving replaces whatever is stored.
 */
export function DiscordWebhookSettings({ societySlug }: { societySlug: string }) {
  const base = `/api/societies/${societySlug}/discord-webhook`;
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);

  useEffect(() => {
    fetch(base)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConfigured(d?.configured ?? false))
      .catch(() => setConfigured(false));
  }, [base]);

  async function send(method: "PUT" | "POST", body?: unknown) {
    const res = await fetch(base, {
      method,
      ...(body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Something went wrong");
    return data;
  }

  async function save() {
    setBusy("save");
    try {
      await send("PUT", { webhookUrl: url.trim() });
      setConfigured(true);
      setUrl("");
      toast.success("Webhook saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the webhook");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      await send("POST");
      toast.success("Test posted — check the channel");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reach Discord");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      await send("PUT", { webhookUrl: null });
      setConfigured(false);
      toast.success("Webhook removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the webhook");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Discord Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Post everything that lands in the exec queue to a Discord channel. In Discord:
          Server Settings → Integrations → Webhooks → New Webhook, pick the channel, then
          copy the URL.
        </p>

        {configured && (
          <p className="flex items-center gap-1.5 text-sm text-green-700">
            <Check className="h-4 w-4" /> A webhook is saved. Posting a new one replaces it.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="discordWebhook">Webhook URL</Label>
          <Input
            id="discordWebhook"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={!url.trim() || busy !== null}>
            {busy === "save" ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : "Save webhook"}
          </Button>
          {configured && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={test} disabled={busy !== null}>
                {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send a test
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-red-600 hover:text-red-700" onClick={remove} disabled={busy !== null}>
                {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remove
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
