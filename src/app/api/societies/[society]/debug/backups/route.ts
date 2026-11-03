import { NextRequest, NextResponse } from "next/server";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createAuditLog } from "@/lib/audit";
import { randomUUID } from "node:crypto";
import { ARCHIVE_NAME, BACKUP_OUT, requireDebug, sha256File, startJob, takeBackup } from "@/lib/debugServer";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { error } = await requireDebug(society);
  if (error) return error;

  await mkdir(BACKUP_OUT, { recursive: true });
  const names = (await readdir(BACKUP_OUT)).filter((f) => ARCHIVE_NAME.test(f));
  const files = await Promise.all(
    names.map(async (name) => {
      const s = await stat(join(BACKUP_OUT, name));
      return { name, bytes: s.size, createdAt: s.mtime.toISOString() };
    })
  );
  files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json(files);
}

// A full backup of the database and the uploads, as a job the page polls.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { error, session, membership } = await requireDebug(society);
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
