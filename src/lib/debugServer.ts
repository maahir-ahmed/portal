import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireMembership } from "./api";
import { createAuditLog } from "./audit";
import { prisma } from "./db";
import { backupsEnabled, debugToolsEnabled } from "./debugTools";
import { setMaintenance } from "./maintenance";

// Server side of Settings > Backups, Settings > Debugging and the restore at the start
// of setup. Every route starts with requireBackups or requireDebug, which answer 404
// (not 403) when the feature is off, so a stack without it does not even confirm it exists.

export const requireDebug = (society: string) => requireStackExec(society, debugToolsEnabled());
export const requireBackups = (society: string) => requireStackExec(society, backupsEnabled());

async function requireStackExec(society: string, enabled: boolean) {
  // Both gates already mean a single-society stack; the slug must also be that
  // society's, since another society's executive could otherwise reach them by URL.
  if (!enabled || society !== process.env.SOCIETY_SLUG) {
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

// The backup container's nightly archives (${BACKUP_DIR}), mounted read-only. On the
// hosted box that folder is shared by every stack, so only this stack's own archives
// count, by the exact name the script gives them; the older two-file backups
// (<stack>_uploads_<date>.tar.gz beside a .sql.gz) don't match, and aren't restorable here.
const NIGHTLY_DIR = process.env.NIGHTLY_DIR;
const STACK = (process.env.STACK ?? "portal").replace(/[^A-Za-z0-9_-]/g, "");
const OWN_ARCHIVE = new RegExp(`^${STACK}_\\d{4}-\\d\\d-\\d\\d_\\d{6}\\.tar\\.gz$`);

export type BackupKind = "nightly" | "manual";
const backupDirs = (): [string, BackupKind][] =>
  NIGHTLY_DIR ? [[BACKUP_OUT, "manual"], [NIGHTLY_DIR, "nightly"]] : [[BACKUP_OUT, "manual"]];
const listable = (name: string, kind: BackupKind) =>
  ARCHIVE_NAME.test(name) && (kind === "manual" || OWN_ARCHIVE.test(name));

/** Every archive on the server, newest first: the nightly ones and those made in the app. */
export async function listBackups() {
  await mkdir(BACKUP_OUT, { recursive: true });
  const found = await Promise.all(
    backupDirs().map(async ([dir, kind]) => {
      const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => listable(n, kind));
      return Promise.all(
        names.map(async (name) => {
          const s = await stat(join(dir, name));
          return { name, kind, bytes: s.size, createdAt: s.mtime.toISOString() };
        })
      );
    })
  );
  return found.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The path of a listed archive, or null. The name is never trusted as a path. */
export async function findBackup(name: string): Promise<{ path: string; bytes: number } | null> {
  for (const [dir, kind] of backupDirs()) {
    if (!listable(name, kind)) continue;
    const s = await stat(join(dir, name)).catch(() => null);
    if (s?.isFile()) return { path: join(dir, name), bytes: s.size };
  }
  return null;
}

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

// ── Restoring ──────────────────────────────────────────────────────────────────

/**
 * Stores one chunk of an archive being uploaded for a restore, appended in order.
 * Chunks rather than one request because Cloudflare refuses request bodies over 100MB
 * and an uploads directory can make an archive far bigger; the client sends each one
 * only after the last was stored, which is also what drives its progress bar.
 */
export async function receiveChunk(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const offset = Number(req.nextUrl.searchParams.get("offset"));
  const expected = Number(req.headers.get("x-chunk-length"));
  if (!UPLOAD_ID.test(id) || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(expected)) {
    return NextResponse.json({ error: "Bad upload request" }, { status: 400 });
  }

  const chunk = Buffer.from(await req.arrayBuffer());
  // Anything between the browser and here could cut a body short without an error
  // (the proxy's buffer limit does exactly that), so check every chunk arrived whole.
  if (chunk.length !== expected) {
    return NextResponse.json({ error: `Chunk arrived as ${chunk.length} of ${expected} bytes` }, { status: 400 });
  }

  const path = incomingPath(id);
  await mkdir(BACKUP_OUT, { recursive: true });
  const have = offset === 0 ? 0 : await stat(path).then((s) => s.size).catch(() => -1);
  if (have !== offset) {
    return NextResponse.json({ error: "Upload out of order; start again" }, { status: 409 });
  }
  if (offset === 0) await writeFile(path, chunk);
  else await appendFile(path, chunk);
  return NextResponse.json({ size: offset + chunk.length });
}

/** The uploaded archive's path, or null when there is no such upload. */
export async function uploaded(id: string): Promise<string | null> {
  const path = incomingPath(id);
  return (await stat(path).catch(() => null)) ? path : null;
}

/** Checks an uploaded archive is whole; the job's result is what is in it. */
export function validateJob(job: string, path: string) {
  return startJob(job, async () => {
    const r = await backupScript("validate", path);
    if (!r.ok) throw new Error(lastLine(r.stderr) || "Not a valid backup");
    return parseReport(r.stdout);
  });
}

/**
 * Replaces the database and uploads with an uploaded archive, as a job. `who` is the
 * executive restoring (null at setup, on an empty portal, where there is nothing to
 * keep a safety backup of). Every other request gets the maintenance page meanwhile.
 */
export function restoreJob(job: string, path: string, who: string | null) {
  const production = process.env.NODE_ENV === "production";
  return startJob(job, async () => {
    const sha256 = await sha256File(path);
    let safetyBackup: string | null = null;
    if (who) {
      const before = await takeBackup();
      if ("error" in before) throw new Error(`Stopped before changing anything: the safety backup failed (${before.error})`);
      safetyBackup = before.file;
    }

    setMaintenance(true);
    const r = await backupScript("restore", path);
    const renamedFrom = r.ok ? await adoptSociety() : null;
    // In production the process restarts below and the schema is brought up to date
    // before anyone is let back in; until then the restored database may be an older
    // shape than this code expects, so the maintenance page stays up.
    if (!r.ok || !production) setMaintenance(false);

    // Written after the restore, because the restore replaces the audit log. The
    // person restoring may not exist in the restored database, so stdout gets a copy.
    const record = { sha256, safetyBackup, ok: r.ok, renamedFrom };
    console.log(`[backups] restore by ${who ?? "setup"}: ${JSON.stringify(record)}`);
    if (who) {
      try {
        const [user, soc] = await Promise.all([
          prisma.user.findUnique({ where: { email: who }, select: { id: true } }),
          prisma.society.findUnique({ where: { slug: process.env.SOCIETY_SLUG }, select: { id: true } }),
        ]);
        if (user) {
          await createAuditLog({
            societyId: soc?.id,
            userId: user.id,
            action: "UPDATE",
            entityType: "Restore",
            entityId: sha256,
            metadata: { ...record, by: who },
          });
        }
      } catch (err) {
        console.warn("[backups] restore audit entry failed:", err instanceof Error ? err.message : err);
      }
    }

    if (!r.ok) throw new JobError(lastLine(r.stderr) || "Restore failed", { safetyBackup });
    await rm(path, { force: true });
    if (production) {
      // Docker restarts the container, which runs db push and the post-push fixes
      // against the restored database before serving again; nginx shows the
      // maintenance page in the gap. The delay lets the job state reach disk first.
      setTimeout(() => process.exit(0), 1000);
    }
    return { restarting: production, safetyBackup, renamedFrom };
  });
}

/**
 * A backup from another machine can carry a different address name (slug) than this
 * stack's SOCIETY_SLUG, which would leave everyone with "no membership" after the
 * restore. With exactly one society in the restored database, it takes this stack's
 * slug. Links stored in the database are slug-free, so nothing else changes.
 */
async function adoptSociety(): Promise<string | null> {
  const slug = process.env.SOCIETY_SLUG;
  if (!slug) return null;
  try {
    const rows = await prisma.$queryRaw<{ slug: string }[]>`SELECT slug FROM "Society"`;
    if (rows.length !== 1 || rows[0].slug === slug) return null;
    await prisma.$executeRaw`UPDATE "Society" SET slug = ${slug}`;
    return rows[0].slug;
  } catch (err) {
    console.warn("[backups] could not match the restored society to SOCIETY_SLUG:", err instanceof Error ? err.message : err);
    return null;
  }
}
