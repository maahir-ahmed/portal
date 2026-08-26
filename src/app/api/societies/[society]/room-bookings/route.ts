import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { notifyExecs } from "@/lib/notifications";
import { isLateArcSubmission } from "@/lib/utils";
import { EVENT_TYPES } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  eventName: z.string().min(1).max(200),
  eventType: z.enum(EVENT_TYPES.map((t) => t.value)),
  preferredDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  description: z.string().min(1),
  maxAttendees: z.number().int().positive(),
  hasExternalGuests: z.boolean(),
  externalGuestsDesc: z.string().nullable().optional(),
  numExternalGuests: z.number().nullable().optional(),
  preferredLocation: z.enum(["LECTURE_THEATRE", "CATS_ROOM", "SECLAB", "ROUNDHOUSE", "OUTDOOR_SPACE", "OTHER"]),
  safetyOfficerName: z.string().min(1),
  safetyOfficerZid: z.string().min(1),
  safetyOfficerPhone: z.string().min(1),
  roomRequirements: z.string().min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());
    const isLate = isLateArcSubmission(body.preferredDate);

    const booking = await prisma.roomBooking.create({
      data: {
        societyId: membership!.societyId,
        submittedById: session!.user.id,
        eventName: body.eventName,
        eventType: body.eventType,
        preferredDate: new Date(body.preferredDate),
        startTime: body.startTime,
        endTime: body.endTime,
        description: body.description,
        maxAttendees: body.maxAttendees,
        hasExternalGuests: body.hasExternalGuests,
        externalGuestsDesc: body.externalGuestsDesc,
        numExternalGuests: body.numExternalGuests,
        preferredLocation: body.preferredLocation,
        safetyOfficerName: body.safetyOfficerName,
        safetyOfficerZid: body.safetyOfficerZid,
        safetyOfficerPhone: body.safetyOfficerPhone,
        roomRequirements: body.roomRequirements,
        status: "SUBMITTED",
      },
    });

    await prisma.thread.create({ data: { roomBookingId: booking.id } });

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "CREATE",
      entityType: "RoomBooking",
      entityId: booking.id,
    });

    const urgencyNote = isLate ? " ⚠️ URGENT: less than 7 business days until the event." : "";
    await notifyExecs(
      membership!.societyId,
      "APPROVAL_REQUIRED",
      `New Room Booking: ${body.eventName}${urgencyNote}`,
      `${session!.user.name} submitted a room booking request for ${body.preferredDate}.`,
      `/requests/room-booking/${booking.id}`
    );

    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
