import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { UPLOAD_ID, restoreJob, uploaded, validateJob } from "@/lib/debugServer";
import { setupRestoreOk } from "@/lib/setup";

const schema = z.object({ id: z.string().regex(UPLOAD_ID), action: z.enum(["validate", "restore"]) });

// Setup's "restore a backup", on a portal with no accounts yet: nothing to confirm
// against and nothing to lose, so no typed name and no safety backup.
export async function POST(req: NextRequest) {
  if (!(await setupRestoreOk(req))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const path = await uploaded(body.id);
  if (!path) return NextResponse.json({ error: "Upload not found; upload the archive again" }, { status: 404 });
  const job = randomUUID();
  await (body.action === "validate" ? validateJob(job, path) : restoreJob(job, path, null));
  return NextResponse.json({ job }, { status: 202 });
}
