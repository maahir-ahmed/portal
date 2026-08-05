import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(60),
  roleLevel: z.enum(["EXECUTIVE", "DIRECTOR", "SUBCOMMITTEE"]),
  // Executive titles have no portfolio; director and subcom titles are how a
  // member ends up in one.
  portfolioId: z.string().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const titles = await prisma.societyTitle.findMany({
    where: { societyId: membership!.societyId },
    orderBy: [{ roleLevel: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { portfolio: { select: { id: true, name: true } } },
  });

  return NextResponse.json(titles);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    const body = createSchema.parse(await req.json());

    const maxOrder = await prisma.societyTitle.aggregate({
      where: { societyId: membership!.societyId, roleLevel: body.roleLevel },
      _max: { sortOrder: true },
    });

    const title = await prisma.societyTitle.create({
      data: {
        societyId: membership!.societyId,
        name: body.name,
        roleLevel: body.roleLevel,
        portfolioId: body.roleLevel === "EXECUTIVE" ? null : (body.portfolioId ?? null),
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json(title, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
