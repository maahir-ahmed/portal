import { NextRequest, NextResponse } from "next/server";
import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { BACKUP_OUT, UPLOAD_ID, incomingPath, requireDebug } from "@/lib/debugServer";

// Receives a backup archive in chunks, appended in order. Chunks rather than one
// request because Cloudflare refuses request bodies over 100MB and an uploads
// directory can make an archive far bigger; the client sends each one only after the
// last was stored, which is also what drives its progress bar.

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { error } = await requireDebug(society);
  if (error) return error;

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
