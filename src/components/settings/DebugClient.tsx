"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Database, FileCode, FileX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import { ConfirmName, size, useStopOnUnmount } from "./BackupsClient";
import { api, runJob } from "@/lib/clientApi";

// Settings > Debugging. Everything here acts on the live database, so the whole tab
// sits in one red panel, and running SQL asks for the society's name and takes a
// backup first (server side, not trusted to this page). Backups have their own tab.

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
            who knows the data model. A SQL file can delete every record on this portal.
          </p>
          <p>
            Raw SQL bypasses the app, so it can leave the database out of step with the schema the app expects.
            After running SQL, check the app still works.
          </p>
          <p>Every SQL run is recorded in the audit log, and the backup taken before it is in Settings › Backups.</p>
        </div>
      </div>
      <SqlRunner base={base} societyName={societyName} />
      <TableViewer base={base} />
      <UnusedUploads base={base} />
    </div>
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
  const stop = useStopOnUnmount();
  const [outcome, setOutcome] = useState<
    { ok: true; results: SqlResult[]; backup: string } | { ok: false; error: string; unchanged: boolean; line?: number; backup?: string } | null
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
        base,
        {},
        stop()
      );
      setOutcome({ ok: true, ...r });
    } catch (e) {
      if (stop().aborted) return;
      const err = e as Error & { data?: { line?: number; backup?: string }; signedOut?: boolean };
      // Only a job that itself failed (or never started) rolled back. A lost session or
      // a lost job says nothing about whether the statement committed.
      setOutcome({
        ok: false,
        error: err.signedOut ? "You were signed out before the result came back, so it is not known whether the file ran. Check the audit log." : err.message,
        unchanged: err.data !== undefined,
        ...err.data,
      });
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
            {outcome.error}{outcome.unchanged && " Nothing was changed."}
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
              <div key={j} className="contents">
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

// ── Unused uploads ────────────────────────────────────────────────────────────

interface OrphanFile {
  name: string;
  bytes: number;
  modifiedAt: string;
}

// Lists first and deletes only on a second click, and the server re-checks each file is
// still unused at that moment, since someone may have attached it in between.
function UnusedUploads({ base }: { base: string }) {
  const [files, setFiles] = useState<OrphanFile[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function find() {
    setBusy(true);
    try {
      setFiles((await api<{ files: OrphanFile[] }>(`${base}/uploads`)).files);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  async function remove() {
    if (!files?.length) return;
    setBusy(true);
    try {
      const r = await api<{ deleted: number; skipped: number }>(`${base}/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: files.map((f) => f.name) }),
      });
      toast.success(`Deleted ${r.deleted} file${r.deleted === 1 ? "" : "s"}${r.skipped ? `; ${r.skipped} had been attached since, so were kept` : ""}`);
      setFiles(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  const total = files?.reduce((n, f) => n + f.bytes, 0) ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><FileX className="h-4 w-4" /> Unused uploaded files</CardTitle>
        <CardDescription>
          Files that were uploaded but are no longer attached to anything: a form left unfinished, or a record
          deleted. Files from the last day are left alone. Nightly backups still hold anything deleted here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" onClick={find} disabled={busy} className="gap-1.5">
          {busy && files === null ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileX className="h-4 w-4" />}
          Find unused files
        </Button>
        {files && files.length === 0 && <p className="text-sm text-muted-foreground">No unused files.</p>}
        {files && files.length > 0 && (
          <>
            <p className="text-sm">
              {files.length} unused file{files.length === 1 ? "" : "s"}, {size(total)} in all.
            </p>
            <ul className="max-h-64 overflow-y-auto rounded-md border bg-background p-2 text-xs space-y-1">
              {files.map((f) => (
                <li key={f.name} className="flex flex-wrap justify-between gap-x-3">
                  <a href={`/uploads/${f.name}`} target="_blank" rel="noreferrer" className="font-mono break-all underline underline-offset-2">{f.name}</a>
                  <span className="text-muted-foreground">{size(f.bytes)}, {formatDate(f.modifiedAt)}</span>
                </li>
              ))}
            </ul>
            <Button onClick={remove} disabled={busy} className="h-auto min-h-9 gap-1.5 whitespace-normal bg-red-700 py-2 text-white hover:bg-red-800">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileX className="h-4 w-4" />}
              Delete these {files.length} file{files.length === 1 ? "" : "s"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
