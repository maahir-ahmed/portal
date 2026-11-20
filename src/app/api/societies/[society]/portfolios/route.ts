import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serverError, requireRole } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({ name: z.string().min(1).max(60) });

// GET is open to any member: the invite/edit member dialogs need the list.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { membership, error: accessErr } = await requireRole(society);
  if (accessErr) return accessErr;

  const portfolios = await prisma.portfolio.findMany({
    where: { societyId: membership!.societyId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { memberships: true, extraMembers: true, titles: true } } },
  });

  return NextResponse.json(
    portfolios.map((p) => ({
      id: p.id,
      name: p.name,
      // Only the Discord settings (executives) read this.
      ...(membership!.role === "EXECUTIVE" && { discordRoleId: p.discordRoleId }),
      // Extra links never repeat the title's portfolio, so the two never double count.
      memberCount: p._count.memberships + p._count.extraMembers,
      titleCount: p._count.titles,
    }))
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { session, membership, error: accessErr } = await requireRole(society, "EXECUTIVE");
  if (accessErr) return accessErr;

  try {
    const body = await req.json();

    const { name } = createSchema.parse(body);
    const existing = await prisma.portfolio.findFirst({
      where: { societyId: membership!.societyId, name },
    });
    if (existing) return NextResponse.json({ error: "That portfolio already exists" }, { status: 409 });

    const last = await prisma.portfolio.aggregate({
      where: { societyId: membership!.societyId },
      _max: { sortOrder: true },
    });
    const portfolio = await prisma.portfolio.create({
      data: { societyId: membership!.societyId, name, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    await createAuditLog({
      societyId: membership!.societyId, userId: session!.user.id, action: "CREATE", entityType: "Portfolio",
      entityId: portfolio.id, metadata: { name },
    });
    return NextResponse.json(portfolio, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return serverError(err);
  }
}
