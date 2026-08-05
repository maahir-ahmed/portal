import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { z } from "zod";

type Params = { society: string; portfolioId: string };

const patchSchema = z.object({ name: z.string().min(1).max(60) });

async function load(userId: string, society: string, portfolioId: string) {
  const { membership, error } = await requireMembership(userId, society, "EXECUTIVE");
  if (error) return { error };

  const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!portfolio || portfolio.societyId !== membership!.societyId) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { portfolio };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, portfolioId } = await params;
  const { error } = await load(session!.user.id, society, portfolioId);
  if (error) return error;

  try {
    const { name } = patchSchema.parse(await req.json());
    const updated = await prisma.portfolio.update({ where: { id: portfolioId }, data: { name } });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Members keep their membership and title; the titles that pointed here are
// unlinked by the schema (onDelete: SetNull), so nobody is left in a dead portfolio.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, portfolioId } = await params;
  const { error } = await load(session!.user.id, society, portfolioId);
  if (error) return error;

  await prisma.$transaction([
    prisma.societyMembership.updateMany({ where: { portfolioId }, data: { portfolioId: null } }),
    prisma.portfolio.delete({ where: { id: portfolioId } }),
  ]);
  return NextResponse.json({ ok: true });
}
