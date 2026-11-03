import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { requireAuth, requireMembership } from "./api";
import { debugToolsEnabled } from "./debugTools";

// Server side of Settings > Debugging. Every route under /debug starts with
// requireDebug, which answers 404 (not 403) when the tools are off, so a stack that
// has not opted in does not even confirm they exist.

export async function requireDebug(society: string) {
  if (!debugToolsEnabled()) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }), session: null, membership: null };
  }
  const { session, error: authErr } = await requireAuth();
  if (authErr) return { error: authErr, session: null, membership: null };
  const { membership, error } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (error) return { error, session: null, membership: null };
  return { error: null, session: session!, membership: membership! };
}

// Where archives live. In the container both are set by compose; in dev they default
// to folders in the checkout (both gitignored).
export const BACKUP_OUT = process.env.BACKUP_OUT ?? join(process.cwd(), "backups");
const UPLOADS = process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads");
const SCRIPT = join(process.cwd(), "deploy", "backup.sh");

/** An archive name as the script writes it. No paths. */
export const ARCHIVE_NAME = /^[A-Za-z0-9_-]+\.tar\.gz$/;

/** An archive being uploaded for a restore. Dot-named, so it is never listed as a
 *  backup, and keyed by an id the browser picks per upload. */
export const UPLOAD_ID = /^[a-z0-9-]{8,64}$/;
export const incomingPath = (id: string) => join(BACKUP_OUT, `.incoming-${id}.tar.gz`);

/**
 * Runs deploy/backup.sh, the one implementation of the archive format, shared with
 * the backup container and the self-hosting scripts.
 */
export function backupScript(...args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("sh", [SCRIPT, ...args], {
      env: { ...process.env, BACKUP_OUT, UPLOADS_DIR: UPLOADS, STACK: process.env.STACK ?? "portal" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => resolve({ ok: false, stdout, stderr: stderr + err.message }));
    child.on("close", (code) => resolve({ ok: code === 0, stdout, stderr }));
  });
}

/** Takes an archive now; returns its file name. */
export async function takeBackup(): Promise<{ file: string } | { error: string }> {
  const r = await backupScript("archive");
  const path = r.stdout.trim().split("\n").pop() ?? "";
  if (!r.ok || !path) return { error: lastLine(r.stderr) || "Backup failed" };
  return { file: path.split("/").pop()! };
}

/** The script's last log line, which is its error when it fails. */
export function lastLine(s: string): string {
  return s.trim().split("\n").pop()?.replace(/^\S+ (ERROR: )?/, "") ?? "";
}

/** key=value lines, as `backup.sh validate` prints them. */
export function parseReport(s: string): Record<string, string> {
  return Object.fromEntries(
    s
      .split("\n")
      .map((l) => l.match(/^([a-z_]+)=(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]])
  );
}

/** sha256 of a file, read as a stream: archives can be larger than memory. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(path)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

// Long actions run as jobs the page polls, not as one long request: Cloudflare cuts a
// request off after 100 seconds, and a big uploads directory takes longer than that
// to archive. The state is a file on the backups volume rather than memory, because
// route handlers need not share module instances, and because a restore restarts the
// process: the page, polling through the restart, still finds out how it ended.
export const JOB_ID = UPLOAD_ID;
const jobPath = (id: string) => join(BACKUP_OUT, `.job-${id}.json`);

export type JobState =
  | { state: "running" }
  | { state: "done"; result: Record<string, unknown> }
  | { state: "failed"; error: string; result?: Record<string, unknown> };

export async function readJob(id: string): Promise<JobState | null> {
  try {
    return JSON.parse(await readFile(jobPath(id), "utf8")) as JobState;
  } catch {
    return null;
  }
}

export class JobError extends Error {
  constructor(message: string, readonly result?: Record<string, unknown>) {
    super(message);
  }
}

/** Starts fn in the background and records how it ends. Returns at once. */
export async function startJob(id: string, fn: () => Promise<Record<string, unknown>>) {
  await mkdir(BACKUP_OUT, { recursive: true });
  const write = (s: JobState) => writeFile(jobPath(id), JSON.stringify(s));
  await write({ state: "running" });
  fn()
    .then((result) => write({ state: "done", result }))
    .catch((err) =>
      write({
        state: "failed",
        error: err instanceof Error ? err.message : String(err),
        ...(err instanceof JobError && err.result ? { result: err.result } : {}),
      })
    )
    .catch((err) => console.error("[debug] could not record job state:", err));
}
