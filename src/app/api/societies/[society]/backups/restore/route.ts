import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { UPLOAD_ID, requireBackups, restoreJob, uploaded, validateJob } from "@/lib/debugServer";

const schema = z.object({
  id: z.string().regex(UPLOAD_ID),
  action: z.enum(["validate", "restore"]),
  confirm: z.string().optional(),
});

// Restores an uploaded archive over the live database and uploads. Validate first
// (the page shows what is in it), then restore, which needs the society's name typed
// in and takes a fresh backup of what is about to be replaced. Both are jobs the page polls.
export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { error, session, membership } = await requireBackups(society);
  if (error) return error;

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const path = await uploaded(body.id);
  if (!path) return NextResponse.json({ error: "Upload not found; upload the archive again" }, { status: 404 });

  const job = randomUUID();
  if (body.action === "validate") {
    await validateJob(job, path);
  } else {
    if (body.confirm?.trim() !== membership.society.name) {
      return NextResponse.json({ error: "Type the society's name exactly to confirm" }, { status: 400 });
    }
    await restoreJob(job, path, session.user.email);
  }
  return NextResponse.json({ job }, { status: 202 });
}
