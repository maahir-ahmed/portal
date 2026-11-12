import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership, serverError } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { notifyExecs } from "@/lib/notifications";
import { isLateArcSubmission, isPlausibleDate } from "@/lib/utils";
import { EVENT_TYPES } from "@/lib/utils";
import { z } from "zod";
import { time24 } from "@/lib/schemas";
import { notDemo } from "@/lib/schemas";

const MAX_PEOPLE = 10000;
const schema = z.object({
  eventName: notDemo(z.string().min(1).max(200)),
  eventType: z.enum(EVENT_TYPES.map((t) => t.value)),
  preferredDate: z.string().refine(isPlausibleDate, "Enter a real date"),
  startTime: time24,
  endTime: time24,
  description: z.string().min(1).max(20000),
  maxAttendees: z.number().int().positive().max(MAX_PEOPLE),
  hasExternalGuests: z.boolean(),
  externalGuestsDesc: z.string().max(5000).nullable().optional(),
  numExternalGuests: z.number().int().min(0).max(MAX_PEOPLE).nullable().optional(),
  preferredLocation: z.enum(["LECTURE_THEATRE", "CATS_ROOM", "SECLAB", "ROUNDHOUSE", "OUTDOOR_SPACE", "OTHER"]),
  safetyOfficerName: z.string().min(1).max(200),
  safetyOfficerZid: z.string().min(1).max(50),
  safetyOfficerPhone: z.string().min(1).max(50),
  roomRequirements: z.string().min(1).max(5000),
})
  // The form enforces these with `required`; an API caller has to meet them too.
  // Same-day times compare as text because both are zero-padded HH:MM.
  .refine((b) => b.endTime > b.startTime, { message: "The end time has to be after the start time", path: ["endTime"] })
  .refine((b) => !b.hasExternalGuests || (!!b.externalGuestsDesc?.trim() && b.numExternalGuests != null), {
    message: "Describe the external guests and say how many",
    path: ["externalGuestsDesc"],
  });

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());
    const isLate = isLateArcSubmission(body.preferredDate, undefined, membership!.society.timezone);

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
    return serverError(err);
  }
}
