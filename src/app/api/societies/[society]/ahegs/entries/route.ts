import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { z } from "zod";

// One member's corrections for one year's submission. The row is created on first
// edit; until then the roster is derived entirely from the member directory.
const schema = z.object({
  membershipId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  category: z.enum(["EXECUTIVE", "MENTOR", "SUBCOMMITTEE"]),
  included: z.boolean(),
  fullName: z.string().max(200).nullable().optional(),
  zid: z.string().max(20).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  position: z.string().max(200).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

const day = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00Z`) : null);

export async function PUT(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());

    // The membership being edited has to belong to this society, or an exec could
    // pull another club's member onto their submission by guessing an id.
    const target = await prisma.societyMembership.findFirst({
      where: { id: body.membershipId, societyId: membership!.societyId },
      select: { id: true },
    });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = {
      category: body.category,
      included: body.included,
      fullName: body.fullName || null,
      zid: body.zid || null,
      email: body.email || null,
      position: body.position || null,
      startDate: day(body.startDate),
      endDate: day(body.endDate),
    };

    await prisma.ahegsEntry.upsert({
      where: { membershipId_year: { membershipId: body.membershipId, year: body.year } },
      create: { societyId: membership!.societyId, membershipId: body.membershipId, year: body.year, ...data },
      update: data,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
