import { NextRequest } from "next/server";
import { receiveChunk, requireBackups } from "@/lib/debugServer";

// One chunk of an archive being uploaded for a restore (see receiveChunk).
export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { error } = await requireBackups(society);
  if (error) return error;
  return receiveChunk(req);
}
