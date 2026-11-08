import { NextRequest, NextResponse } from "next/server";
import { receiveChunk } from "@/lib/debugServer";
import { setupRestoreOk } from "@/lib/setup";

// Setup's "restore a backup": one chunk of the archive (see receiveChunk).
export async function POST(req: NextRequest) {
  if (!(await setupRestoreOk(req))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return receiveChunk(req);
}
