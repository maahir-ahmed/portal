import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

type Params = { society: string; id: string };

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const body = await req.json();
  const booking = await prisma.roomBooking.findUnique({ where: { id } });
  if (!booking || booking.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isExec = membership!.role === "EXECUTIVE";
  // Submitter or exec may edit the request details; only execs move the status.
  const canEdit = isExec || booking.submittedById === session!.user.id;
  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);

  // Arc only names a room once it has approved the booking, so the field opens then
  // and stays open (it can be moved later). Gated here rather than only in the UI:
  // the status this is checked against is the stored one, not one the caller sent.
  // Clearing it back to empty is allowed, which is why "" is handled separately.
  const roomOpen = booking.status === "APPROVED" || booking.status === "COMPLETED";
  if (typeof body.assignedRoom === "string" && !roomOpen) {
    return NextResponse.json(
      { error: "The booked room can only be set once the booking is approved" },
      { status: 400 }
    );
  }

  // Naming the room is the last thing that happens to a booking, so recording it
  // closes the booking out. Only on the way in — clearing the room again leaves the
  // status alone rather than reopening something already finished, and an explicit
  // status in the same request wins.
  // Exec-only, like every other status change: a submitter may still record the room
  // Arc gave them, it just does not close the booking on its own.
  const autoComplete =
    isExec &&
    typeof body.assignedRoom === "string" &&
    body.assignedRoom.trim().length > 0 &&
    booking.status === "APPROVED" &&
    !body.status;

  const updated = await prisma.roomBooking.update({
    where: { id },
    data: {
      ...(autoComplete ? { status: "COMPLETED" as const } : {}),
      ...(isExec && body.status ? { status: body.status } : {}),
      ...(isExec && body.status === "SUBMITTED_TO_ARC" ? { submittedToArcAt: new Date() } : {}),
      ...(str(body.eventName) ? { eventName: body.eventName } : {}),
      ...(str(body.eventType) ? { eventType: body.eventType } : {}),
      ...(body.preferredDate ? { preferredDate: new Date(body.preferredDate) } : {}),
      ...(str(body.startTime) ? { startTime: body.startTime } : {}),
      ...(str(body.endTime) ? { endTime: body.endTime } : {}),
      ...(str(body.description) ? { description: body.description } : {}),
      ...(Number.isFinite(body.maxAttendees) && body.maxAttendees > 0 ? { maxAttendees: body.maxAttendees } : {}),
      ...(typeof body.hasExternalGuests === "boolean"
        ? {
            hasExternalGuests: body.hasExternalGuests,
            externalGuestsDesc: body.hasExternalGuests ? (body.externalGuestsDesc ?? null) : null,
            numExternalGuests: body.hasExternalGuests ? (body.numExternalGuests ?? null) : null,
          }
        : {}),
      ...(str(body.preferredLocation) ? { preferredLocation: body.preferredLocation } : {}),
      ...(str(body.safetyOfficerName) ? { safetyOfficerName: body.safetyOfficerName } : {}),
      ...(str(body.safetyOfficerZid) ? { safetyOfficerZid: body.safetyOfficerZid } : {}),
      ...(str(body.safetyOfficerPhone) ? { safetyOfficerPhone: body.safetyOfficerPhone } : {}),
      ...(str(body.roomRequirements) ? { roomRequirements: body.roomRequirements } : {}),
      ...(typeof body.assignedRoom === "string"
        ? { assignedRoom: body.assignedRoom.trim() || null }
        : {}),
    },
  });

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: body.status || autoComplete ? "STATUS_CHANGE" : "UPDATE",
    entityType: "RoomBooking",
    entityId: id,
    ...(body.status || autoComplete
      ? { metadata: { from: booking.status, to: body.status ?? "COMPLETED" } }
      : {}),
  });

  // Tell the submitter their booking moved — unless they are the one who moved it.
  const newStatus = body.status && isExec && body.status !== booking.status
    ? body.status
    : autoComplete
      ? "COMPLETED"
      : null;
  if (newStatus && booking.submittedById !== session!.user.id) {
    await createNotification({
      userId: booking.submittedById,
      type: "STATUS_CHANGE",
      title: `Room Booking Updated: ${booking.eventName}`,
      body: autoComplete && !body.status
        ? `Room confirmed as ${body.assignedRoom.trim()}. Marked completed.`
        : `Status changed to ${String(newStatus).replace(/_/g, " ").toLowerCase()}.`,
      link: `/requests/room-booking/${id}`,
    });
  }

  return NextResponse.json(updated);
}

// Deletable by the submitter or any exec, same permission as editing.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const booking = await prisma.roomBooking.findUnique({ where: { id } });
  if (!booking || booking.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isExec = membership!.role === "EXECUTIVE";
  const isOwner = booking.submittedById === session!.user.id;
  if (!isExec && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // The where clause IS the authorization check, re-enforced atomically at delete
  // time. The thread's FK would only be nulled out, so remove it explicitly;
  // notification links would 404 once the booking is gone, so clear those too.
  const deleteWhere = {
    id,
    societyId: membership!.societyId,
    ...(isExec ? {} : { submittedById: session!.user.id }),
  };

  await prisma.$transaction(async (tx) => {
    await tx.thread.deleteMany({ where: { roomBooking: { is: deleteWhere } } });
    await tx.roomBooking.deleteMany({ where: deleteWhere });
    await tx.notification.deleteMany({ where: { link: `/requests/room-booking/${id}` } });
  });

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "DELETE",
    entityType: "RoomBooking",
    entityId: id,
    metadata: {
      eventName: booking.eventName,
      status: booking.status,
      submittedById: booking.submittedById,
    },
  });

  if (!isOwner) {
    await createNotification({
      userId: booking.submittedById,
      type: "STATUS_CHANGE",
      title: "Room Booking Deleted",
      body: `Your room booking "${booking.eventName}" was deleted by an executive.`,
      link: `/requests/room-booking`,
    });
  }

  return NextResponse.json({ ok: true });
}
