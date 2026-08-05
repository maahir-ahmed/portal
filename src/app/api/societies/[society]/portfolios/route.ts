import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { DEFAULT_PORTFOLIOS } from "@/lib/portfolios";
import { z } from "zod";

const createSchema = z.object({ name: z.string().min(1).max(60) });

// GET is open to any member: the invite/edit member dialogs need the list.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const portfolios = await prisma.portfolio.findMany({
    where: { societyId: membership!.societyId },
    orderBy: { name: "asc" },
    include: { _count: { select: { memberships: true } } },
  });

  return NextResponse.json(
    portfolios.map((p) => ({ id: p.id, name: p.name, memberCount: p._count.memberships }))
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    const body = await req.json();

    // { defaults: true } seeds the usual set in one go, for a society that has none.
    if (body?.defaults === true) {
      await prisma.portfolio.createMany({
        data: DEFAULT_PORTFOLIOS.map((name) => ({ societyId: membership!.societyId, name })),
        skipDuplicates: true,
      });
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    const { name } = createSchema.parse(body);
    const existing = await prisma.portfolio.findFirst({
      where: { societyId: membership!.societyId, name },
    });
    if (existing) return NextResponse.json({ error: "That portfolio already exists" }, { status: 409 });

    const portfolio = await prisma.portfolio.create({
      data: { societyId: membership!.societyId, name },
    });
    return NextResponse.json(portfolio, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
