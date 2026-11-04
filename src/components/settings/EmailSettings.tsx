"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, offline } from "@/lib/utils";

// Settings > Email, and the setup wizard's Email step. Picking Brevo or Resend fills in
// the technical half (server, port, login) so the person only pastes a key and an address.

type Provider = "brevo" | "resend" | "other";
type Saved = { source: "app" | "server" | "off" | null; host: string; port: number; user: string; from: string; passSet: boolean };

const PROVIDERS: Record<Provider, { name: string; url?: string; limit: string; host: string; port: number; steps: string[] }> = {
  brevo: {
    name: "Brevo",
    url: "https://www.brevo.com",
    limit: "Free: 300 emails a day",
    host: "smtp-relay.brevo.com",
    port: 587,
    steps: [
      "Create a free account at brevo.com.",
      "Senders, Domains & Dedicated IPs › Domains: add your domain, then add the DNS records it lists. If your domain is on Cloudflare, Brevo can add them for you.",
      "Senders: add the address you'll send from, such as noreply@your-domain.",
      "SMTP & API › SMTP: generate an SMTP key. Copy it, and the SMTP login shown on the same page, into the boxes below.",
    ],
  },
  resend: {
    name: "Resend",
    url: "https://resend.com",
    limit: "Free: 100 emails a day",
    host: "smtp.resend.com",
    port: 465,
    steps: [
      "Create a free account at resend.com.",
      "Domains: add your domain, add the DNS records it lists (it can add them for you if your domain is on Cloudflare), then click Verify.",
      "API Keys: create a key with sending access to that domain, and paste it below.",
    ],
  },
  other: {
    name: "Something else",
    limit: "Any service that gives you SMTP details",
    host: "",
    port: 587,
    steps: ["Your email service's help pages list its SMTP server, port, username and password."],
  },
};

const providerOf = (host: string): Provider =>
  host.includes("brevo") ? "brevo" : host.includes("resend") ? "resend" : host ? "other" : "brevo";

export function EmailSettings({ societySlug }: { societySlug: string }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [provider, setProvider] = useState<Provider>("brevo");
  const [f, setF] = useState({ host: "", port: "587", user: "", pass: "", from: "" });
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchSaved = (slug: string): Promise<Saved> => fetch(`/api/societies/${slug}/email`).then((r) => r.json());
  function show(s: Saved) {
    setSaved(s);
    const p = providerOf(s.host);
    setProvider(p);
    setF({ host: s.host || PROVIDERS[p].host, port: String(s.port || PROVIDERS[p].port), user: s.user, pass: "", from: s.from });
  }
  const load = () => fetchSaved(societySlug).then(show);
  useEffect(() => { fetchSaved(societySlug).then(show); }, [societySlug]);

  function pick(p: Provider) {
    setProvider(p);
    setF({ ...f, host: PROVIDERS[p].host, port: String(PROVIDERS[p].port), user: p === "resend" ? "resend" : p === providerOf(saved?.host ?? "") ? saved!.user : "" });
  }

  async function put(body: object) {
    setBusy(true);
    setTest(null);
    const res = await fetch(`/api/societies/${societySlug}/email`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(offline);
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Couldn't save. Try again.");
      return false;
    }
    await load();
    return true;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (await put({ mode: "app", ...f })) toast.success("Saved. Send yourself a test to check it works.");
  }

  async function sendTest() {
    setBusy(true);
    setTest(null);
    const res = await fetch(`/api/societies/${societySlug}/email`, { method: "POST" }).catch(offline);
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setTest(res.ok ? { ok: true, text: `Sent to ${data.to}. If it isn't in the inbox within a minute, check the spam folder.` } : { ok: false, text: data.error ?? "It didn't send." });
  }

  if (!saved) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const on = saved.source === "app" || saved.source === "server";
  const p = PROVIDERS[provider];

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "rounded-lg border p-3 text-sm",
          on ? "border-green-300 bg-green-50 text-green-900" : "border-amber-300 bg-amber-50 text-amber-900"
        )}
      >
        {saved.source === "app" && <>Email is on, through {saved.host}. New members get their sign-in details by email.</>}
        {saved.source === "server" && (
          <>Email is on, using the settings in the server&apos;s env file ({saved.host}). Saving here replaces them.</>
        )}
        {saved.source === "off" && <>Email is switched off. You pass each new member their sign-in details yourself.</>}
        {saved.source === null && (
          <>Email isn&apos;t set up yet, so you pass each new member their sign-in details yourself. Setting it up takes about 15 minutes.</>
        )}
      </div>

      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Choose an email service</CardTitle>
            <CardDescription>
              Both free ones work well. You&apos;ll need a domain you can add DNS records to, such as your society&apos;s
              website address.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(PROVIDERS) as Provider[]).map((k) => (
              <label
                key={k}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                  provider === k ? "border-foreground bg-secondary/50" : "hover:bg-secondary/50"
                )}
              >
                <input type="radio" name="provider" checked={provider === k} onChange={() => pick(k)} className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{PROVIDERS[k].name}</span>
                  <span className="block text-xs text-muted-foreground">{PROVIDERS[k].limit}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Set up {p.name === "Something else" ? "your service" : p.name}</CardTitle>
            {p.url && (
              <CardDescription>
                <a href={p.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Open {p.name}
                </a>{" "}
                in a new tab, then:
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1.5 pl-4 text-sm">
              {p.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Paste the details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {provider === "other" && (
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">SMTP server</Label>
                  <Input id="smtp-host" value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="smtp.example.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input id="smtp-port" inputMode="numeric" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} required />
                </div>
              </div>
            )}
            {provider !== "resend" && (
              <div className="space-y-2">
                <Label htmlFor="smtp-user">{provider === "brevo" ? "SMTP login" : "Username"}</Label>
                <Input
                  id="smtp-user"
                  value={f.user}
                  onChange={(e) => setF({ ...f, user: e.target.value })}
                  placeholder={provider === "brevo" ? "Ends in @smtp-brevo.com" : ""}
                  autoComplete="off"
                  required={provider === "brevo"}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="smtp-pass">{provider === "brevo" ? "SMTP key" : provider === "resend" ? "API key" : "Password"}</Label>
              <Input
                id="smtp-pass"
                type="password"
                value={f.pass}
                onChange={(e) => setF({ ...f, pass: e.target.value })}
                placeholder={saved.passSet && saved.source === "app" ? "Saved. Leave blank to keep it" : provider === "resend" ? "Starts with re_" : ""}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-from">Send as</Label>
              <Input
                id="smtp-from"
                value={f.from}
                onChange={(e) => setF({ ...f, from: e.target.value })}
                placeholder="Chess Society <noreply@chesssoc.org>"
                required
              />
              <p className="text-xs text-muted-foreground">The name people see, then an address at the domain you set up.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
              {on && (
                <Button type="button" variant="outline" onClick={sendTest} disabled={busy}>
                  Send me a test email
                </Button>
              )}
            </div>
            {test && (
              <p role="status" className={cn("text-sm", test.ok ? "text-green-700" : "text-red-700")}>
                {test.text}
              </p>
            )}
          </CardContent>
        </Card>
      </form>

      {(saved.source === "app" || saved.source === "server") && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button type="button" variant="ghost" size="sm" onClick={() => put({ mode: "off" }).then((ok) => ok && toast.success("Email is off"))} disabled={busy}>
            Turn email off
          </Button>
          {saved.source === "app" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => put({ mode: "server" }).then((ok) => ok && toast.success("Using the server's settings, if it has any"))}
              disabled={busy}
            >
              Use the server&apos;s settings instead
            </Button>
          )}
        </div>
      )}
      {saved.source === "off" && (
        <Button type="button" variant="ghost" size="sm" onClick={() => put({ mode: "server" })} disabled={busy}>
          Undo: go back to the server&apos;s settings
        </Button>
      )}
    </div>
  );
}
