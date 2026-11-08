import { NextRequest, NextResponse } from "next/server";
import { JOB_ID, readJob } from "@/lib/debugServer";
import { setupTokenOk } from "@/lib/setup";

// How setup's restore is going. Token only, not "no accounts yet": once the restore
// lands there are accounts, and the page still needs to hear how it ended.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!setupTokenOk(req.headers.get("x-setup-token"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const job = JOB_ID.test(id) ? await readJob(id) : null;
  if (!job) return NextResponse.json({ error: "No such job" }, { status: 404 });
  return NextResponse.json(job);
}
