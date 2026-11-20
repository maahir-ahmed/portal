import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requireDebug } from "@/lib/debugServer";
import { deleteOrphanUploads, findOrphanUploads } from "@/lib/orphanUploads";

// Uploaded files nothing refers to: GET lists them, POST deletes the ones confirmed.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { error } = await requireDebug(society);
  if (error) return error;
  try {
    return NextResponse.json({ files: await findOrphanUploads() });
  } catch (err) {
    console.error("[debug] orphan upload scan failed:", err);
    return NextResponse.json({ error: "Could not check the uploads folder" }, { status: 500 });
  }
}

const schema = z.object({ names: z.array(z.string().max(100)).min(1).max(10_000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { error, session, membership } = await requireDebug(society);
  if (error) return error;
  try {
    const { names } = schema.parse(await req.json());
    const deleted = await deleteOrphanUploads(names);
    await createAuditLog({
      societyId: membership.societyId,
      userId: session.user.id,
      action: "DELETE",
      entityType: "Upload",
      entityId: "orphans",
      metadata: { count: deleted.length, bytes: deleted.reduce((n, f) => n + f.bytes, 0), files: deleted.map((f) => f.name).join(" ") },
    });
    return NextResponse.json({ deleted: deleted.length, skipped: names.length - deleted.length });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    console.error("[debug] orphan upload delete failed:", err);
    return NextResponse.json({ error: "Could not delete the files" }, { status: 500 });
  }
}
