import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { ahegsYearOf, FIRST_YEAR } from "@/lib/years";

// The society calendar: per year, the AGM date (closes the financial year) and the
// end of Term 3 (closes the AHEGS year). See src/lib/years.ts for how they're used.

type Params = { params: Promise<{ society: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const years = await prisma.societyYear.findMany({
    where: { societyId: membership!.societyId },
    orderBy: { year: "asc" },
    select: { year: true, agmDate: true, term3End: true },
  });
  return NextResponse.json(years);
}

// "YYYY-MM-DD" from a date input, or null to clear it and fall back to the default.
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const schema = z.object({
  years: z
    .array(
      z
        .object({ year: z.number().int().min(FIRST_YEAR).max(2100), agmDate: day, term3End: day })
        // A date filed under the wrong year would silently shift every boundary.
        .refine((r) => [r.agmDate, r.term3End].every((d) => !d || Number(d.slice(0, 4)) === r.year), {
          message: "Each date has to fall in the year it's set for",
        })
    )
    .max(20),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    const { years } = schema.parse(await req.json());
    const societyId = membership!.societyId;
    const asDate = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);

    await prisma.$transaction(
      years.map((y) =>
        prisma.societyYear.upsert({
          where: { societyId_year: { societyId, year: y.year } },
          update: { agmDate: asDate(y.agmDate), term3End: asDate(y.term3End) },
          create: { societyId, year: y.year, agmDate: asDate(y.agmDate), term3End: asDate(y.term3End) },
        })
      )
    );

    // A meeting's AHEGS year is filed from its date when it's logged; moving a Term 3
    // end moves the boundary, so re-file any meeting now on the other side of it.
    const calendar = await prisma.societyYear.findMany({ where: { societyId } });
    const meetings = await prisma.ahegsMeeting.findMany({ where: { societyId }, select: { id: true, date: true, year: true } });
    const moved = meetings
      .map((m) => ({ id: m.id, year: ahegsYearOf(calendar, m.date), was: m.year }))
      .filter((m) => m.year !== m.was);
    if (moved.length) {
      await prisma.$transaction(moved.map((m) => prisma.ahegsMeeting.update({ where: { id: m.id }, data: { year: m.year } })));
    }

    await createAuditLog({
      societyId,
      userId: session!.user.id,
      action: "UPDATE",
      entityType: "SocietyYear",
      entityId: societyId,
      metadata: { years: years.map((y) => y.year).join(", ") },
    });

    return NextResponse.json({ ok: true, meetingsMoved: moved.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
