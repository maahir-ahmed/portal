import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { JobError, requireDebug, startJob, takeBackup } from "@/lib/debugServer";
import { plain, transactionControl } from "@/lib/debugTables";

const schema = z.object({
  fileName: z.string().max(200),
  sql: z.string().min(1).max(5_000_000),
  confirm: z.string(),
});

const MAX_ROWS = 500;

/** 1-based line of a character position (Postgres reports errors by position). */
const lineAt = (sql: string, position: number) => sql.slice(0, position).split("\n").length;

// Runs an uploaded .sql file against the live database, after a backup, in a single
// transaction: every statement applies or none does. A job the page polls, since the
// backup alone can outlast Cloudflare's 100-second request limit.
export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { error, session, membership } = await requireDebug(society);
  if (error) return error;

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (body.confirm.trim() !== membership.society.name) {
    return NextResponse.json({ error: "Type the society's name exactly to confirm" }, { status: 400 });
  }
  const control = transactionControl(body.sql);
  if (control) {
    return NextResponse.json(
      { error: `Line ${lineAt(body.sql, control.index)}: remove ${control.word}. The file already runs as one transaction.` },
      { status: 400 }
    );
  }

  const sql = body.sql;
  const fileName = body.fileName;
  const job = randomUUID();
  await startJob(job, async () => {
    const sha256 = createHash("sha256").update(sql).digest("hex");
    const backup = await takeBackup();
    if ("error" in backup) throw new Error(`Stopped before running anything: the backup failed (${backup.error})`);

    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    let outcome: { ok: true; results: unknown[] } | { ok: false; error: string; line?: number };
    try {
      await client.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '5min'");
      // Waiting on a lock the live app holds would stall the site behind it; give up instead.
      await client.query("SET LOCAL lock_timeout = '10s'");
      // Rows as arrays: as objects, two columns of the same name (a join's two ids)
      // would collapse into one.
      const raw = await client.query({ text: sql, rowMode: "array" });
      await client.query("COMMIT");
      // One statement gives one result, several give an array.
      const all = (Array.isArray(raw) ? raw : [raw]) as pg.QueryResult[];
      outcome = {
        ok: true,
        results: all.map((r) => ({
          command: r.command,
          rowCount: r.rowCount,
          columns: r.fields?.map((f) => f.name) ?? [],
          rows: ((r.rows ?? []) as unknown as unknown[][]).slice(0, MAX_ROWS).map((row) => row.map(plain)),
          truncated: (r.rows?.length ?? 0) > MAX_ROWS,
        })),
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      const e = err as { message?: string; position?: string };
      outcome = {
        ok: false,
        error: e.message ?? String(err),
        ...(e.position ? { line: lineAt(sql, Number(e.position)) } : {}),
      };
    } finally {
      await client.end().catch(() => {});
    }

    await createAuditLog({
      societyId: membership.societyId,
      userId: session.user.id,
      action: "UPDATE",
      entityType: "SqlRun",
      entityId: sha256,
      metadata: { file: fileName, sha256, bytes: Buffer.byteLength(sql), backup: backup.file, ok: outcome.ok },
    }).catch(() => {}); // the SQL may have changed the audit table itself

    if (!outcome.ok) throw new JobError(outcome.error, { ...outcome, backup: backup.file });
    return { ...outcome, backup: backup.file };
  });
  return NextResponse.json({ job }, { status: 202 });
}
