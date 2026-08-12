import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAhegsAccess, membershipsInScope } from "@/lib/ahegsServer";
import { canTouchPortfolio } from "@/lib/ahegs";
import { z } from "zod";

type Params = { society: string; id: string };

const schema = z.object({
  title: z.string().min(1).max(300).optional(),
  date: z.string().min(1).optional(),
  hours: z.number().min(0).max(24).optional(),
  fileUrl: z.string().max(2000).nullable().optional(),
  fileName: z.string().max(300).nullable().optional(),
  attendeeIds: z.array(z.string()).max(500).optional(),
});

/** The meeting must exist in this society and sit in a portfolio the caller owns. */
async function loadInScope(societyId: string, id: string, scope: Awaited<ReturnType<typeof requireAhegsAccess>>["scope"]) {
  const meeting = await prisma.ahegsMeeting.findFirst({ where: { id, societyId } });
  if (!meeting || !canTouchPortfolio(scope!, meeting.portfolioId)) return null;
  return meeting;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { society, id } = await params;
  const { membership, scope, error } = await requireAhegsAccess(society);
  if (error) return error;

  try {
    const body = schema.parse(await req.json());
    const meeting = await loadInScope(membership.societyId, id, scope);
    if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.fileUrl && !/^(\/uploads\/|https?:\/\/)/.test(body.fileUrl)) {
      return NextResponse.json({ error: "Minutes must be an uploaded file or an http(s) link" }, { status: 400 });
    }

    let attendees: { id: string }[] | null = null;
    if (body.attendeeIds) {
      attendees = await membershipsInScope(membership.societyId, scope, body.attendeeIds);
      if (attendees === null) return NextResponse.json({ error: "Unknown attendee" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.ahegsMeeting.update({
        where: { id },
        data: {
          ...(body.title ? { title: body.title } : {}),
          ...(body.date ? { date: new Date(`${body.date}T00:00:00Z`) } : {}),
          ...(body.hours !== undefined ? { hours: body.hours } : {}),
          ...(body.fileUrl !== undefined ? { fileUrl: body.fileUrl || null } : {}),
          ...(body.fileName !== undefined ? { fileName: body.fileName || null } : {}),
        },
      });
      // Replacing the list wholesale keeps the hours sum honest: dropping someone has
      // to take their credit for this meeting with it.
      if (attendees) {
        await tx.ahegsAttendance.deleteMany({ where: { meetingId: id } });
        await tx.ahegsAttendance.createMany({
          data: attendees.map((a) => ({ meetingId: id, membershipId: a.id })),
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { society, id } = await params;
  const { membership, scope, error } = await requireAhegsAccess(society);
  if (error) return error;

  const meeting = await loadInScope(membership.societyId, id, scope);
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Attendance rows cascade, so everyone's hours drop by this meeting's duration.
  await prisma.ahegsMeeting.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
