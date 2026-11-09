"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { offline } from "@/lib/utils";

// Settings > Backups, and the restore offered at the start of setup. Also the helpers
// Settings > Debugging shares for its own long-running jobs.

// Under the proxy's request buffer (next.config.ts) with room to spare; well under
// Cloudflare's 100MB body limit, which is why uploads are chunked at all.
const CHUNK = 16 * 1024 * 1024;

export const size = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init).catch(offline);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { data });
  return data as T;
}

/**
 * Starts a job and waits for it. The server runs backups, restores and SQL in the
 * background (a request would hit Cloudflare's 100-second limit), so this polls. A
 * 502/503 means the maintenance page or a restart is in the way: keep waiting.
 */
export async function runJob<T>(url: string, init: RequestInit, base: string, headers: Record<string, string> = {}): Promise<T> {
  const { job } = await api<{ job: string }>(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`${base}/jobs/${job}`, { cache: "no-store", headers }).catch(() => null);
    if (!res || res.status === 502 || res.status === 503 || res.status === 504) continue;
    // Signed out by a restore that replaced the account: the reload sorts that out.
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("signed out"), { signedOut: true });
    const s = await res.json();
    if (s.state === "done") return s.result as T;
    if (s.state === "failed") throw Object.assign(new Error(s.error), { data: s.result ?? {} });
  }
}

export function ConfirmName({ societyName, value, onChange }: { societyName: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span>
        Type <span className="font-semibold break-words">{societyName}</span> to confirm
      </span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} />
    </label>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

interface BackupFile {
  name: string;
  kind: "nightly" | "manual";
  bytes: number;
  createdAt: string;
}

const taken = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export function Backups({ base }: { base: string }) {
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<BackupFile[]>(base).then(setFiles).catch((e) => toast.error(e.message));
  }, [base]);
  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    try {
      const r = await runJob<{ name: string; bytes: number }>(base, { method: "POST" }, base);
      toast.success(`Backed up: ${r.name} (${size(r.bytes)})`);
      // Straight to the browser's download bar: the point of pressing it is the file.
      Object.assign(document.createElement("a"), { href: `${base}/${r.name}`, download: r.name }).click();
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" /> Download a backup</CardTitle>
        <CardDescription>
          Everything on the portal in one file: every member, request and setting, and every uploaded receipt,
          photo, logo and set of minutes. Keep it somewhere other than this server. It holds members&apos; bank
          details, so treat it like a password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={create} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? "Backing up…" : "Back up and download"}
        </Button>
        {files && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Backups on the server</p>
            <p className="text-xs text-muted-foreground">
              Nightly backups are taken automatically and kept for two weeks. Ones taken here include the backup made
              before each restore.
            </p>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y rounded-md border bg-background">
                {files.map((f) => (
                  <li key={`${f.kind}/${f.name}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium">{taken(f.createdAt)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {f.kind === "nightly" ? "Nightly" : "Taken here"} · {size(f.bytes)}
                      </span>
                    </span>
                    <a
                      href={`${base}/${f.name}`}
                      download
                      aria-label={`Download the backup from ${taken(f.createdAt)}`}
                      className="inline-flex items-center gap-1 text-xs underline"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Import ────────────────────────────────────────────────────────────────────

type Report = Record<string, string>;

/**
 * Uploads an archive in chunks, shows what is in it, then restores it. In Settings it
 * asks for the society's name and replaces a live portal; at setup (`setupToken`) the
 * portal is empty, so it just goes ahead, and then sends everyone to sign in.
 */
export function Restore({ base, societyName, setupToken }: { base: string; societyName?: string; setupToken?: string }) {
  const headers: Record<string, string> = setupToken ? { "X-Setup-Token": setupToken } : {};
  const [file, setFile] = useState<File | null>(null);
  const [sent, setSent] = useState(0);
  const [id, setId] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "checking" | "restoring" | "restarting">("idle");

  function reset(f: File | null) {
    setFile(f);
    setSent(0);
    setId(null);
    setReport(null);
    setProblem(null);
    setConfirm("");
  }

  async function upload() {
    if (!file) return;
    const uploadId = crypto.randomUUID();
    setPhase("uploading");
    setProblem(null);
    try {
      // One chunk at a time, in order: the server appends each and checks its offset.
      for (let offset = 0; offset < file.size || offset === 0; offset += CHUNK) {
        const chunk = file.slice(offset, offset + CHUNK);
        await api(`${base}/upload?id=${uploadId}&offset=${offset}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/octet-stream", "X-Chunk-Length": String(chunk.size) },
          body: chunk,
        });
        setSent(Math.min(file.size, offset + CHUNK));
        if (file.size === 0) break;
      }
      setId(uploadId);
      setPhase("checking");
      setReport(
        await runJob<Report>(
          `${base}/restore`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: uploadId, action: "validate" }) },
          base,
          headers
        )
      );
    } catch (e) {
      setProblem((e as Error).message);
    }
    setPhase("idle");
  }

  async function restore() {
    if (!id) return;
    setPhase("restoring");
    try {
      const r = await runJob<{ restarting: boolean }>(
        `${base}/restore`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "restore", confirm }) },
        base,
        headers
      );
      if (!r.restarting) {
        toast.success("Restored. Restart the dev server and run npm run db:push.");
        setPhase("idle");
        return;
      }
      // The portal restarts to bring the schema up to date. Wait for it, then load in
      // full: the session may belong to someone the restored database does not have,
      // in which case it lands on the login page.
      setPhase("restarting");
      await new Promise((r) => setTimeout(r, 4000));
      for (let i = 0; i < 90; i++) {
        const ok = await fetch("/login", { cache: "no-store" }).then((r) => r.ok).catch(() => false);
        if (ok) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      // A full load, not the router: the restored database brings its own accounts.
      if (setupToken) window.location.replace("/login");
      else window.location.reload();
    } catch (e) {
      const err = e as Error & { data?: { safetyBackup?: string }; signedOut?: boolean };
      if (err.signedOut) return window.location.reload();
      setProblem(err.message + (err.data?.safetyBackup ? ` A backup from just before is on this page: ${err.data.safetyBackup}` : ""));
      setPhase("idle");
    }
  }

  const pct = file && file.size ? Math.round((sent / file.size) * 100) : 0;
  const missing = Number(report?.missing_uploads ?? 0);

  return (
    <Card className={setupToken ? undefined : "border-red-300"}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Restore a backup</CardTitle>
        <CardDescription>
          {setupToken ? (
            <>
              Choose the backup file from the old portal: a <code>.tar.gz</code> downloaded from its Settings › Backups,
              or one from its <code>backups</code> folder. Everyone signs in afterwards with the same email and password
              as before. Saved passwords for email, Discord and Rubric only carry over if you copied{" "}
              <code>portal.env</code> from the old computer before installing; otherwise enter them again in Settings.
            </>
          ) : (
            <>
              Replaces everything on this portal with the backup&apos;s. Anything added since that backup was taken is
              lost. A backup of how things are now is taken first, and the portal shows a maintenance page while it
              runs.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          type="file"
          accept=".gz,.tar.gz,application/gzip"
          aria-label="Backup file"
          onChange={(e) => reset(e.target.files?.[0] ?? null)}
          disabled={phase !== "idle"}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
        />
        {file && !report && (
          <Button onClick={upload} disabled={phase !== "idle"} variant="outline" className="gap-1.5">
            {phase !== "idle" && <Loader2 className="h-4 w-4 animate-spin" />}
            {phase === "uploading" ? `Uploading ${pct}%` : phase === "checking" ? "Checking the backup…" : `Upload and check (${size(file.size)})`}
          </Button>
        )}
        {phase === "uploading" && (
          <div className="h-2 w-full overflow-hidden rounded bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
        {problem && <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-900 break-words">{problem}</p>}
        {report && (
          <div className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border bg-background p-3 text-sm">
              <dt className="text-muted-foreground">Taken</dt><dd className="break-all">{report.created}</dd>
              <dt className="text-muted-foreground">From</dt><dd className="break-all">{report.stack}</dd>
              <dt className="text-muted-foreground">Database</dt><dd>{size(Number(report.database_bytes))}</dd>
              <dt className="text-muted-foreground">Uploads</dt><dd>{report.uploads} files</dd>
            </dl>
            <p className="text-sm text-green-800">The backup is complete and undamaged.</p>
            {missing > 0 && (
              <p className="text-sm text-amber-800">
                {missing} file{missing === 1 ? " the database links to is" : "s the database links to are"} not in the
                backup. They were probably already missing when it was taken.
              </p>
            )}
            {societyName && <ConfirmName societyName={societyName} value={confirm} onChange={setConfirm} />}
            <Button
              onClick={restore}
              disabled={(!!societyName && confirm.trim() !== societyName) || phase !== "idle"}
              className={
                setupToken
                  ? "gap-1.5"
                  : "h-auto min-h-9 gap-1.5 whitespace-normal bg-red-700 py-2 text-left text-white hover:bg-red-800"
              }
            >
              {phase === "restoring" || phase === "restarting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              {phase === "restoring"
                ? "Restoring…"
                : phase === "restarting"
                  ? "Restarting the portal…"
                  : setupToken
                    ? "Restore this backup"
                    : "Replace everything with this backup"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
