import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { createAuditLog } from "@/lib/audit";
import { findBackup, requireBackups } from "@/lib/debugServer";

// Streams an archive to the browser. With Content-Length set, the browser's own
// download bar shows progress, and the file never sits in this process's memory.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string; file: string }> }) {
  const { society, file } = await params;
  const { error, session, membership } = await requireBackups(society);
  if (error) return error;

  const found = await findBackup(file);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Every member's bank details leave the server in this file, so who took it is recorded.
  await createAuditLog({
    societyId: membership.societyId,
    userId: session.user.id,
    action: "READ",
    entityType: "Backup",
    entityId: file,
    metadata: { file, bytes: found.bytes },
  });

  return new Response(Readable.toWeb(createReadStream(found.path)) as ReadableStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(found.bytes),
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
