import { NextRequest, NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { createAuditLog } from "@/lib/audit";
import { randomUUID } from "node:crypto";
import { BACKUP_OUT, listBackups, requireBackups, sha256File, startJob, takeBackup } from "@/lib/debugServer";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { error } = await requireBackups(society);
  if (error) return error;

  return NextResponse.json(await listBackups());
}

// A full backup of the database and the uploads, as a job the page polls.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { error, session, membership } = await requireBackups(society);
  if (error) return error;

  const job = randomUUID();
  await startJob(job, async () => {
    const result = await takeBackup();
    if ("error" in result) throw new Error(result.error);
    const path = join(BACKUP_OUT, result.file);
    const [bytes, sha256] = await Promise.all([stat(path).then((s) => s.size), sha256File(path)]);
    await createAuditLog({
      societyId: membership.societyId,
      userId: session.user.id,
      action: "CREATE",
      entityType: "Backup",
      entityId: result.file,
      metadata: { file: result.file, bytes, sha256 },
    });
    return { name: result.file, bytes, sha256 };
  });
  return NextResponse.json({ job }, { status: 202 });
}
