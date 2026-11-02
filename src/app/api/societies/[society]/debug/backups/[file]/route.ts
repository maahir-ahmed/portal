import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { ARCHIVE_NAME, BACKUP_OUT, requireDebug } from "@/lib/debugServer";

// Streams an archive to the browser. With Content-Length set, the browser's own
// download bar shows progress, and the file never sits in this process's memory.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string; file: string }> }) {
  const { society, file } = await params;
  const { error } = await requireDebug(society);
  if (error) return error;

  if (!ARCHIVE_NAME.test(file)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const path = join(BACKUP_OUT, file);
  const size = await stat(path).then((s) => s.size).catch(() => null);
  if (size === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
