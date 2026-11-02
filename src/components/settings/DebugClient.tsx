"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Database, Download, FileCode, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Settings > Debugging. Everything here acts on the live database, so the whole tab
// sits in one red panel, and each action that changes data asks for the society's
// name and takes a backup first (server side, not trusted to this page).

// Under the proxy's request buffer (next.config.ts) with room to spare; well under
// Cloudflare's 100MB body limit, which is why uploads are chunked at all.
const CHUNK = 16 * 1024 * 1024;

const size = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { data });
  return data as T;
}

/**
 * Starts a job and waits for it. The server runs backups, restores and SQL in the
 * background (a request would hit Cloudflare's 100-second limit), so this polls. A
 * 502/503 means the maintenance page or a restart is in the way: keep waiting.
 */
async function runJob<T>(url: string, init: RequestInit, base: string): Promise<T> {
  const { job } = await api<{ job: string }>(url, init);
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`${base}/jobs/${job}`, { cache: "no-store" }).catch(() => null);
    if (!res || res.status === 502 || res.status === 503 || res.status === 504) continue;
    // Signed out by a restore that replaced the account: the reload sorts that out.
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("signed out"), { signedOut: true });
    const s = await res.json();
    if (s.state === "done") return s.result as T;
    if (s.state === "failed") throw Object.assign(new Error(s.error), { data: s.result ?? {} });
  }
}

export function DebugClient({ societySlug, societyName }: { societySlug: string; societyName: string }) {
  const base = `/api/societies/${societySlug}/debug`;
  return (
    <div className="rounded-xl border-2 border-red-600 bg-red-50/40 p-3 sm:p-5 space-y-6">
      <div className="flex items-start gap-3 text-red-900">
        <AlertTriangle className="h-6 w-6 flex-shrink-0 text-red-600" />
        <div className="space-y-1.5 text-sm min-w-0">
          <p className="text-base font-semibold">Danger zone</p>
          <p>
            These tools read and change the live database directly. They are meant for testing and for someone
            who knows the data model. A restore or a SQL file can delete every record on this portal.
          </p>
          <p>
            Raw SQL and restores bypass the app, so they can leave the database out of step with the schema the
            app expects. Restoring restarts the portal, which brings the schema up to date; after running SQL,
            check the app still works.
          </p>
          <p>Every backup, restore and SQL run is recorded in the audit log.</p>
        </div>
      </div>
      <Backups base={base} />
      <Restore base={base} societyName={societyName} />
      <SqlRunner base={base} societyName={societyName} />
      <TableViewer base={base} />
    </div>
  );
}

function ConfirmName({ societyName, value, onChange }: { societyName: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span>
        Type <span className="font-semibold break-words">{societyName}</span> to confirm
      </span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} />
    </label>
  );
}

// ── Backups ───────────────────────────────────────────────────────────────────

interface BackupFile {
  name: string;
  bytes: number;
  createdAt: string;
}

function Backups({ base }: { base: string }) {
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<BackupFile[]>(`${base}/backups`).then(setFiles).catch((e) => toast.error(e.message));
  }, [base]);
  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    try {
      const r = await runJob<{ name: string; bytes: number }>(`${base}/backups`, { method: "POST" }, base);
      toast.success(`Backed up: ${r.name} (${size(r.bytes)})`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Save className="h-4 w-4" /> Backups</CardTitle>
        <CardDescription>
          The whole database and every uploaded file (receipts, photos, logos, minutes) in one archive. It restores
          here or with the restore script, and so do the daily backups.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={create} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {busy ? "Backing up…" : "Back up now"}
        </Button>
        {files === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground">No backups here yet.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-background">
            {files.map((f) => (
              <li key={f.name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 break-all font-mono text-xs">{f.name}</span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  {size(f.bytes)}
                  <a href={`${base}/backups/${f.name}`} download className="inline-flex items-center gap-1 text-foreground underline">
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Restore ───────────────────────────────────────────────────────────────────

type Report = Record<string, string>;

function Restore({ base, societyName }: { base: string; societyName: string }) {
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
          headers: { "Content-Type": "application/octet-stream", "X-Chunk-Length": String(chunk.size) },
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
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: uploadId, action: "validate" }),
          },
          base
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
      const r = await runJob<{ restarting: boolean; safetyBackup: string }>(
        `${base}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action: "restore", confirm }),
        },
        base
      );
      if (!r.restarting) {
        toast.success("Restored. Restart the dev server and run npm run db:push.");
        setPhase("idle");
        return;
      }
      // The portal restarts to bring the schema up to date. Wait for it, then reload in
      // full: the session may belong to someone the restored database does not have,
      // in which case the reload lands on the login page.
      setPhase("restarting");
      await new Promise((r) => setTimeout(r, 4000));
      for (let i = 0; i < 90; i++) {
        const ok = await fetch("/login", { cache: "no-store" }).then((r) => r.ok).catch(() => false);
        if (ok) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      window.location.reload();
    } catch (e) {
      const err = e as Error & { data?: { safetyBackup?: string }; signedOut?: boolean };
      if (err.signedOut) return window.location.reload();
      setProblem(err.message + (err.data?.safetyBackup ? ` A backup from just before is in Backups: ${err.data.safetyBackup}` : ""));
      setPhase("idle");
    }
  }

  const pct = file && file.size ? Math.round((sent / file.size) * 100) : 0;
  const missing = Number(report?.missing_uploads ?? 0);

  return (
    <Card className="border-red-300">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Restore a backup</CardTitle>
        <CardDescription>
          Replaces the entire database and every uploaded file with the archive&apos;s. Anything added since that
          backup is lost. A fresh backup is taken first, and the portal shows a maintenance page while it runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          type="file"
          accept=".gz,.tar.gz,application/gzip"
          aria-label="Backup archive"
          onChange={(e) => reset(e.target.files?.[0] ?? null)}
          disabled={phase !== "idle"}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
        />
        {file && !report && (
          <Button onClick={upload} disabled={phase !== "idle"} variant="outline" className="gap-1.5">
            {phase !== "idle" && <Loader2 className="h-4 w-4 animate-spin" />}
            {phase === "uploading" ? `Uploading ${pct}%` : phase === "checking" ? "Checking the archive…" : `Upload and check (${size(file.size)})`}
          </Button>
        )}
        {phase === "uploading" && (
          <div className="h-2 w-full overflow-hidden rounded bg-red-100">
            <div className="h-full bg-red-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
        {problem && <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-900 break-words">{problem}</p>}
        {report && (
          <div className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border bg-background p-3 text-sm">
              <dt className="text-muted-foreground">From stack</dt><dd className="break-all">{report.stack}</dd>
              <dt className="text-muted-foreground">Taken</dt><dd className="break-all">{report.created}</dd>
              <dt className="text-muted-foreground">Database</dt><dd>{size(Number(report.database_bytes))}</dd>
              <dt className="text-muted-foreground">Uploads</dt><dd>{report.uploads} files</dd>
            </dl>
            <p className="text-sm text-green-800">The database dump and the uploads belong together and are undamaged.</p>
            {missing > 0 && (
              <p className="text-sm text-amber-800">
                {missing} file{missing === 1 ? " the database links to is" : "s the database links to are"} not in the
                archive. They were probably already missing when the backup was taken.
              </p>
            )}
            <ConfirmName societyName={societyName} value={confirm} onChange={setConfirm} />
            <Button
              onClick={restore}
              disabled={confirm.trim() !== societyName || phase !== "idle"}
              className="h-auto min-h-9 gap-1.5 whitespace-normal bg-red-700 py-2 text-left text-white hover:bg-red-800"
            >
              {phase === "restoring" || phase === "restarting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              {phase === "restoring" ? "Restoring…" : phase === "restarting" ? "Restarting the portal…" : "Replace everything with this backup"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── SQL ───────────────────────────────────────────────────────────────────────

interface SqlResult {
  command: string;
  rowCount: number | null;
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

const PREVIEW_LINES = 200;

function SqlRunner({ base, societyName }: { base: string; societyName: string }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<
    { ok: true; results: SqlResult[]; backup: string } | { ok: false; error: string; line?: number; backup?: string } | null
  >(null);

  async function pick(f: File | undefined) {
    setOutcome(null);
    setConfirm("");
    setFile(f ? { name: f.name, text: await f.text() } : null);
  }

  async function run() {
    if (!file) return;
    setRunning(true);
    try {
      const r = await runJob<{ results: SqlResult[]; backup: string }>(
        `${base}/sql`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, sql: file.text, confirm }),
        },
        base
      );
      setOutcome({ ok: true, ...r });
    } catch (e) {
      const err = e as Error & { data?: { line?: number; backup?: string } };
      setOutcome({ ok: false, error: err.message, ...err.data });
    }
    setRunning(false);
  }

  const lines = file?.text.split("\n") ?? [];

  return (
    <Card className="border-red-300">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><FileCode className="h-4 w-4" /> Run a SQL file</CardTitle>
        <CardDescription>
          Runs the whole file in one transaction, after a backup: every statement applies, or none do. Leave out
          BEGIN and COMMIT.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          type="file"
          accept=".sql,text/plain"
          aria-label="SQL file"
          onChange={(e) => pick(e.target.files?.[0])}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
        />
        {file && (
          <>
            <p className="text-xs text-muted-foreground break-all">
              {file.name}: {lines.length} lines, {size(new Blob([file.text]).size)}
              {lines.length > PREVIEW_LINES && `, first ${PREVIEW_LINES} shown`}
            </p>
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-all rounded-md border bg-background p-3 font-mono text-xs">
              {lines.slice(0, PREVIEW_LINES).join("\n")}
            </pre>
            <ConfirmName societyName={societyName} value={confirm} onChange={setConfirm} />
            <Button
              onClick={run}
              disabled={confirm.trim() !== societyName || running}
              className="h-auto min-h-9 gap-1.5 whitespace-normal bg-red-700 py-2 text-left text-white hover:bg-red-800"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode className="h-4 w-4" />}
              {running ? "Backing up and running…" : "Back up, then run this file"}
            </Button>
          </>
        )}
        {outcome && !outcome.ok && (
          <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-900 break-words">
            {outcome.line ? `Line ${outcome.line}: ` : ""}
            {outcome.error} Nothing was changed.
          </p>
        )}
        {outcome?.ok && (
          <div className="space-y-3">
            <p className="text-sm text-green-800">
              Committed. Backup taken first: <span className="font-mono text-xs break-all">{outcome.backup}</span>
            </p>
            {outcome.results.map((r, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-xs font-medium">
                  {i + 1}. {r.command} {r.rowCount ?? 0} row{r.rowCount === 1 ? "" : "s"}
                  {r.truncated && " (first 500 shown)"}
                </p>
                {r.rows.length > 0 && <Records columns={r.columns} rows={r.rows.slice(0, 50)} />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Table viewer ──────────────────────────────────────────────────────────────

interface TableInfo {
  name: string;
  rows: number;
}
interface TablePage {
  columns: { name: string; masked: boolean }[];
  rows: unknown[][];
  page: number;
  pageSize: number;
  total: number;
}

// Rows as stacked records rather than a wide table, so any table reads at 320px
// without scrolling sideways.
function Records({ columns, rows, masked = [] }: { columns: string[]; rows: unknown[][]; masked?: boolean[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <dl key={i} className="grid grid-cols-1 gap-x-3 rounded-md border bg-background p-2.5 text-xs sm:grid-cols-[minmax(0,10rem)_1fr]">
          {columns.map((c, j) => {
            const v = row[j];
            const text = v === null || v === undefined ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v);
            return (
              <div key={c} className="contents">
                <dt className={cn("truncate font-medium text-muted-foreground", masked[j] && "text-red-700")}>{c}</dt>
                <dd className={cn("break-all font-mono", v === null && "text-muted-foreground/60")} title={text.length > 300 ? text : undefined}>
                  {text.length > 300 ? `${text.slice(0, 300)}…` : text}
                </dd>
              </div>
            );
          })}
        </dl>
      ))}
    </div>
  );
}

function TableViewer({ base }: { base: string }) {
  const [tables, setTables] = useState<TableInfo[] | null>(null);
  const [table, setTable] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<TablePage | null>(null);

  useEffect(() => {
    api<TableInfo[]>(`${base}/tables`).then(setTables).catch((e) => toast.error(e.message));
  }, [base]);

  useEffect(() => {
    if (!table) return;
    let live = true;
    api<TablePage>(`${base}/tables/${encodeURIComponent(table)}?page=${page}`)
      .then((d) => live && setData(d))
      .catch((e) => toast.error(e.message));
    return () => {
      live = false;
    };
  }, [base, table, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" /> Database</CardTitle>
        <CardDescription>
          Read-only. Passwords, tokens, sessions, webhook addresses and bank details are hidden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tables === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <select
            aria-label="Table"
            value={table}
            onChange={(e) => { setTable(e.target.value); setPage(0); setData(null); }}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Choose a table…</option>
            {tables.map((t) => (
              <option key={t.name} value={t.name}>{t.name} ({t.rows} rows)</option>
            ))}
          </select>
        )}
        {data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {data.total === 0 ? "No rows" : `Rows ${data.page * data.pageSize + 1}–${Math.min(data.total, (data.page + 1) * data.pageSize)} of ${data.total}`}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button size="sm" variant="outline" className="h-7" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
              </span>
            </div>
            <Records columns={data.columns.map((c) => c.name)} masked={data.columns.map((c) => c.masked)} rows={data.rows} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
