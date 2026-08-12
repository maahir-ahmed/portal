import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAhegsAccess, membershipsInScope } from "@/lib/ahegsServer";
import { canTouchPortfolio } from "@/lib/ahegs";
import { z } from "zod";

// A meeting a portfolio ran, with its minutes. Directors log their own portfolio's
// meetings; executives can log any, including whole-of-committee ones.
const schema = z.object({
  year: z.number().int().min(2000).max(2100),
  title: z.string().min(1).max(300),
  date: z.string().min(1),
  hours: z.number().min(0).max(24),
  portfolioId: z.string().nullable().optional(),
  fileUrl: z.string().max(2000).nullable().optional(),
  fileName: z.string().max(300).nullable().optional(),
  attendeeIds: z.array(z.string()).max(500).default([]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { session, membership, scope, error } = await requireAhegsAccess(society);
  if (error) return error;

  try {
    const body = schema.parse(await req.json());

    // A director may only file against their own portfolio; an executive may pick any
    // (or none, for a meeting the whole committee attended).
    const portfolioId = scope.isExec ? (body.portfolioId ?? null) : scope.portfolioId;
    if (!canTouchPortfolio(scope, portfolioId)) {
      return NextResponse.json({ error: "Not your portfolio" }, { status: 403 });
    }
    if (portfolioId) {
      const exists = await prisma.portfolio.count({ where: { id: portfolioId, societyId: membership.societyId } });
      if (!exists) return NextResponse.json({ error: "Unknown portfolio" }, { status: 400 });
    }

    // Everyone marked present must be someone the caller can see, so attendance can't
    // be used to credit hours to a member of another portfolio.
    const attendees = await membershipsInScope(membership.societyId, scope, body.attendeeIds);
    if (attendees === null) return NextResponse.json({ error: "Unknown attendee" }, { status: 403 });

    if (body.fileUrl && !/^(\/uploads\/|https?:\/\/)/.test(body.fileUrl)) {
      return NextResponse.json({ error: "Minutes must be an uploaded file or an http(s) link" }, { status: 400 });
    }

    const meeting = await prisma.ahegsMeeting.create({
      data: {
        societyId: membership.societyId,
        createdById: session.user.id,
        portfolioId,
        year: body.year,
        title: body.title,
        date: new Date(`${body.date}T00:00:00Z`),
        hours: body.hours,
        fileUrl: body.fileUrl || null,
        fileName: body.fileName || null,
        attendees: { create: attendees.map((a) => ({ membershipId: a.id })) },
      },
      include: { attendees: { select: { membershipId: true } } },
    });

    return NextResponse.json(meeting, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
