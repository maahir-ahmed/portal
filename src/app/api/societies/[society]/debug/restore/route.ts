import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { setMaintenance } from "@/lib/maintenance";
import {
  JobError,
  UPLOAD_ID,
  backupScript,
  incomingPath,
  lastLine,
  parseReport,
  requireDebug,
  sha256File,
  startJob,
  takeBackup,
} from "@/lib/debugServer";

const schema = z.object({
  id: z.string().regex(UPLOAD_ID),
  action: z.enum(["validate", "restore"]),
  confirm: z.string().optional(),
});

// Restores an uploaded archive over the live database and uploads. Validate first
// (the page shows what is in it), then restore, which needs the society's name typed
// in, takes a fresh backup of what is about to be replaced, and holds every other
// request on the maintenance page while it runs. Both are jobs the page polls.
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
  const path = incomingPath(body.id);
  if (!(await stat(path).catch(() => null))) {
    return NextResponse.json({ error: "Upload not found; upload the archive again" }, { status: 404 });
  }
  const job = randomUUID();

  if (body.action === "validate") {
    await startJob(job, async () => {
      const r = await backupScript("validate", path);
      if (!r.ok) throw new Error(lastLine(r.stderr) || "Not a valid backup");
      return parseReport(r.stdout);
    });
    return NextResponse.json({ job }, { status: 202 });
  }

  if (body.confirm?.trim() !== membership.society.name) {
    return NextResponse.json({ error: "Type the society's name exactly to confirm" }, { status: 400 });
  }
  const who = session.user.email;
  const production = process.env.NODE_ENV === "production";

  await startJob(job, async () => {
    const sha256 = await sha256File(path);
    const before = await takeBackup();
    if ("error" in before) throw new Error(`Stopped before changing anything: the safety backup failed (${before.error})`);

    setMaintenance(true);
    const r = await backupScript("restore", path);
    // In production the process restarts below and the schema is brought up to date
    // before anyone is let back in; until then the restored database may be an older
    // shape than this code expects, so the maintenance page stays up.
    if (!r.ok || !production) setMaintenance(false);

    // Written after the restore, because the restore replaces the audit log. The
    // person restoring may not exist in the restored database, so stdout gets a copy.
    const record = { sha256, safetyBackup: before.file, ok: r.ok };
    console.log(`[debug] restore by ${who}: ${JSON.stringify(record)}`);
    try {
      const [user, soc] = await Promise.all([
        prisma.user.findUnique({ where: { email: who }, select: { id: true } }),
        prisma.society.findUnique({ where: { slug: society }, select: { id: true } }),
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
      console.warn("[debug] restore audit entry failed:", err instanceof Error ? err.message : err);
    }

    if (!r.ok) throw new JobError(lastLine(r.stderr) || "Restore failed", { safetyBackup: before.file });
    await rm(path, { force: true });
    if (production) {
      // Docker restarts the container, which runs db push and the post-push fixes
      // against the restored database before serving again; nginx shows the
      // maintenance page in the gap. The delay lets the job state reach disk first.
      setTimeout(() => process.exit(0), 1000);
    }
    return { restarting: production, safetyBackup: before.file };
  });
  return NextResponse.json({ job }, { status: 202 });
}
