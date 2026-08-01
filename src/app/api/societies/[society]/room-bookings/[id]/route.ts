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

  const updated = await prisma.roomBooking.update({
    where: { id },
    data: {
      ...(isExec && body.status ? { status: body.status } : {}),
      ...(isExec && body.status === "SUBMITTED_TO_ARC" ? { submittedToArcAt: new Date() } : {}),
      ...(str(body.eventName) ? { eventName: body.eventName } : {}),
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
    },
  });

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: body.status ? "STATUS_CHANGE" : "UPDATE",
    entityType: "RoomBooking",
    entityId: id,
    ...(body.status ? { metadata: { from: booking.status, to: body.status } } : {}),
  });

  if (isExec && body.status && body.status !== booking.status) {
    await createNotification({
      userId: booking.submittedById,
      type: "STATUS_CHANGE",
      title: `Room Booking Updated: ${booking.eventName}`,
      body: `Status changed to ${body.status.replace(/_/g, " ").toLowerCase()}.`,
      link: `/requests/room-booking/${id}`,
    });
  }

  return NextResponse.json(updated);
}
