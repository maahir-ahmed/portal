import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import type { SocietyMembership } from "@prisma/client";

type Params = { society: string; id: string };

// Only files /api/upload wrote (random UUID name) and only image types: these end up
// in an Arc grant as evidence, and the page renders them as <img>.
const PHOTO_URL = /^\/uploads\/[A-Za-z0-9-]+\.(jpe?g|png|gif|webp)$/i;

const createSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().regex(PHOTO_URL, "Photos must be JPG, PNG, GIF or WebP uploads"),
});

const deleteSchema = z.object({ photoId: z.string().min(1) });

// Same people who can edit the event, but photos come after the event has run, so a
// COMPLETED event still takes them. A cancelled event never ran, so there is nothing
// to evidence.
async function findManageableEvent(id: string, membership: SocietyMembership, userId: string) {
  const event = await prisma.contentRequest.findFirst({
    where: { id, societyId: membership.societyId },
    select: { id: true, submittedById: true, status: true },
  });
  if (!event) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const canManage =
    event.submittedById === userId || membership.role === "EXECUTIVE" || membership.role === "DIRECTOR";
  if (!canManage) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  if (event.status === "CANCELLED") {
    return { error: NextResponse.json({ error: "This event was cancelled" }, { status: 403 }) };
  }
  return { event };
}

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  try {
    const body = createSchema.parse(await req.json());

    const { error } = await findManageableEvent(id, membership!, session!.user.id);
    if (error) return error;

    const photo = await prisma.eventPhoto.create({
      data: {
        contentRequestId: id,
        fileName: body.fileName,
        fileUrl: body.fileUrl,
        uploadedById: session!.user.id,
      },
    });

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "CREATE",
      entityType: "EventPhoto",
      entityId: photo.id,
      metadata: { contentRequestId: id, fileName: body.fileName },
    });

    return NextResponse.json(photo, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  try {
    const { photoId } = deleteSchema.parse({ photoId: req.nextUrl.searchParams.get("photoId") });

    const { error } = await findManageableEvent(id, membership!, session!.user.id);
    if (error) return error;

    // Scoped to this event so a photo id from another event (or society) can't be
    // deleted through an event the caller happens to manage.
    const photo = await prisma.eventPhoto.findFirst({ where: { id: photoId, contentRequestId: id } });
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.eventPhoto.delete({ where: { id: photo.id } });

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "DELETE",
      entityType: "EventPhoto",
      entityId: photo.id,
      metadata: { contentRequestId: id, fileName: photo.fileName, uploadedById: photo.uploadedById },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
