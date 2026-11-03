import { NextRequest, NextResponse } from "next/server";
import { JOB_ID, readJob, requireDebug } from "@/lib/debugServer";

// How a backup, restore or SQL run is going. The page polls this until it ends.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string; id: string }> }) {
  const { society, id } = await params;
  const { error } = await requireDebug(society);
  if (error) return error;
  const job = JOB_ID.test(id) ? await readJob(id) : null;
  if (!job) return NextResponse.json({ error: "No such job" }, { status: 404 });
  return NextResponse.json(job);
}
