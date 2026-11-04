"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, offline } from "@/lib/utils";

// Settings > Discord: the two Discord features that used to need the server's env file.

/** Deadline reminders under each event request's Discord post (src/lib/reminders.ts). */
export function DiscordReminders({ societySlug }: { societySlug: string }) {
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/societies/${societySlug}`)
      .then((r) => r.json())
      .then((s: { discordReminders: boolean | null; remindersDefault: boolean }) => setOn(s.discordReminders ?? s.remindersDefault));
  }, [societySlug]);

  async function change(next: boolean) {
    setOn(next);
    const res = await fetch(`/api/societies/${societySlug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordReminders: next }),
    }).catch(offline);
    if (!res.ok) {
      setOn(!next);
      toast.error("Couldn't save. Try again.");
    } else toast.success(next ? "Reminders on" : "Reminders off");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Deadline reminders</CardTitle>
        <CardDescription>
          Needs the events channel above. As an event request&apos;s content deadline gets closer, the portal posts a
          reminder under its Discord post, pinging the portfolio running it (or the marketing role).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {on === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-secondary/50">
            <input type="checkbox" checked={on} onChange={(e) => change(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span className="text-sm font-medium">Send deadline reminders</span>
          </label>
        )}
      </CardContent>
    </Card>
  );
}

type Bot = { on: boolean; source: "app" | "server" | null; appId: string; publicKey: string; guildId: string; tokenSet: boolean; interactionsUrl: string };

/** The /print and /claim bot (docs/DISCORD_BOT_SPIKE.md), walked through for someone new to Discord's developer site. */
export function DiscordBot({ societySlug }: { societySlug: string }) {
  const [saved, setSaved] = useState<Bot | null>(null);
  const [f, setF] = useState({ appId: "", publicKey: "", guildId: "", token: "" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const fetchSaved = (slug: string): Promise<Bot> => fetch(`/api/societies/${slug}/discord-bot`).then((r) => r.json());
  function show(b: Bot) {
    setSaved(b);
    setF({ appId: b.appId, publicKey: b.publicKey, guildId: b.guildId, token: "" });
  }
  useEffect(() => { fetchSaved(societySlug).then(show); }, [societySlug]);

  async function put(body: object) {
    setBusy(true);
    setProblem(null);
    const res = await fetch(`/api/societies/${societySlug}/discord-bot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(offline);
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(data.error ?? "Couldn't save. Try again.");
    setProblem(data.problem ?? null);
    if (!data.problem) toast.success("Saved");
    fetchSaved(societySlug).then(show);
  }

  if (!saved) return null;
  const invite = /^\d{17,20}$/.test(f.appId)
    ? `https://discord.com/oauth2/authorize?client_id=${f.appId}&scope=applications.commands`
    : null;
  const field = (id: keyof typeof f, label: string, hint: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`bot-${id}`}>{label}</Label>
      <Input
        id={`bot-${id}`}
        type={type}
        value={f[id]}
        onChange={(e) => setF({ ...f, [id]: e.target.value })}
        placeholder={id === "token" && saved.tokenSet ? "Saved. Leave blank to keep it" : ""}
        autoComplete="off"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Discord bot: printing and claims (optional)</CardTitle>
        <CardDescription>
          Members type <code>/print</code> in your server with a file to send a printing request, or <code>/claim</code>{" "}
          with a photo of a receipt to claim money back. It asks for their bank details the first time. Takes about 15
          minutes to set up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div
          className={cn(
            "rounded-lg border p-3 text-sm",
            saved.on ? "border-green-300 bg-green-50 text-green-900" : "bg-secondary/40 text-muted-foreground"
          )}
        >
          {saved.on
            ? saved.source === "server"
              ? "The bot is on, using the settings in the server's env file. Saving here replaces them."
              : "The bot is on. Members whose Discord username was in your member import can use /print and /claim straight away; anyone else links their account on My Account first."
            : "The bot is off."}
        </div>

        <ol className="list-decimal space-y-2 pl-4 text-sm">
          <li>
            Open the{" "}
            <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Discord Developer Portal
            </a>
            , click <b>New Application</b> and name it after your society.
          </li>
          <li>
            On <b>General Information</b>, copy the <b>Application ID</b> and <b>Public Key</b> into the boxes below.
          </li>
          <li>
            On <b>Bot</b>, turn off <b>Public Bot</b> (so only you can add it to servers), then click <b>Reset Token</b>{" "}
            and copy the token below. Discord shows it once.
          </li>
          <li>
            In Discord itself: User Settings › Advanced › turn on <b>Developer Mode</b>. Then right-click your server&apos;s
            icon › <b>Copy Server ID</b>, and paste it below.
          </li>
          <li>
            Add the app to your server:{" "}
            {invite ? (
              <a href={invite} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                open this link
              </a>
            ) : (
              "the link appears here once the Application ID is in"
            )}{" "}
            and pick your server.
          </li>
          <li>
            Click <b>Save</b> here. Then, back on <b>General Information</b>, paste this into <b>Interactions Endpoint URL</b>{" "}
            and save it there too:
            <code className="mt-1 block break-all rounded bg-muted px-2 py-1">{saved.interactionsUrl}</code>
          </li>
        </ol>

        <div className="grid gap-4 sm:grid-cols-2">
          {field("appId", "Application ID", "A long number, from General Information")}
          {field("publicKey", "Public Key", "64 letters and numbers, from General Information")}
          {field("token", "Bot token", "From Bot › Reset Token", "password")}
          {field("guildId", "Server ID", "From Copy Server ID")}
        </div>
        {problem && (
          <p role="alert" className="text-sm text-red-700">
            Saved, but Discord said: {problem} Check the Application ID and token, then save again.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => put({ on: true, ...f })} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          {saved.on && (
            <Button type="button" variant="ghost" onClick={() => put({ on: false })} disabled={busy}>
              Turn the bot off
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
