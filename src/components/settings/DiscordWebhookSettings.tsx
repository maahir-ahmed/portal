"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Loader2, MessageSquare, Send, Trash2 } from "lucide-react";

const COPY = {
  queue: {
    title: "Discord notifications",
    blurb: "Post everything that lands in the exec queue to a Discord channel.",
  },
  events: {
    title: "Discord: events and marketing",
    blurb:
      "Post every new event or marketing request, in full, to your marketing channel, pinging the role below. When the request is edited on the portal, the same Discord message is edited to match.",
  },
} as const;

/**
 * A Discord webhook: the exec queue's, or the marketing channel's (`channel="events"`,
 * which also takes the role to ping). The saved URL is never sent back here, the
 * server reports only whether one exists, so the field is always blank on load and
 * saving replaces whatever is stored.
 */
export function DiscordWebhookSettings({
  societySlug,
  channel = "queue",
}: {
  societySlug: string;
  channel?: "queue" | "events";
}) {
  const base = `/api/societies/${societySlug}/discord-webhook${channel === "events" ? "?channel=events" : ""}`;
  const copy = COPY[channel];
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [url, setUrl] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "remove" | "role" | null>(null);

  useEffect(() => {
    fetch(base)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setConfigured(d?.configured ?? false);
        setRoleId(d?.roleId ?? "");
      })
      .catch(() => setConfigured(false));
  }, [base]);

  async function saveRole() {
    setBusy("role");
    try {
      await send("PUT", { roleId: roleId.trim() || null });
      toast.success(roleId.trim() ? "Role saved" : "Role cleared, new requests won't ping anyone");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the role");
    } finally {
      setBusy(null);
    }
  }

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
          <MessageSquare className="h-4 w-4" /> {copy.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {copy.blurb} In Discord: Server Settings → Integrations → Webhooks → New Webhook,
          pick the channel, then copy the URL.
        </p>

        {configured && (
          <p className="flex items-center gap-1.5 text-sm text-green-700">
            <Check className="h-4 w-4" /> A webhook is saved. Posting a new one replaces it.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`discordWebhook-${channel}`}>Webhook URL</Label>
          <Input
            id={`discordWebhook-${channel}`}
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

        {channel === "events" && (
          <div className="space-y-1.5 border-t pt-3">
            <Label htmlFor="eventsRoleId">Role to ping</Label>
            <p className="text-xs text-muted-foreground">
              The marketing director role&apos;s ID. In Discord, turn on User Settings → Advanced →
              Developer Mode, then Server Settings → Roles, right-click the role and Copy Role ID.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                id="eventsRoleId"
                inputMode="numeric"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 112233445566778899"
                className="min-w-0 flex-1 tabnums"
              />
              <Button size="sm" variant="outline" onClick={saveRole} disabled={busy !== null}>
                {busy === "role" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save role"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
