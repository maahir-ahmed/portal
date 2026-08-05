import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { z } from "zod";

type Params = { society: string; titleId: string };

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  portfolioId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, titleId } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const title = await prisma.societyTitle.findUnique({ where: { id: titleId } });
  if (!title || title.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = patchSchema.parse(await req.json());
    const updated = await prisma.societyTitle.update({
      where: { id: titleId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.portfolioId !== undefined && {
          portfolioId: title.roleLevel === "EXECUTIVE" ? null : body.portfolioId,
        }),
      },
    });

    // Members holding this title follow it to its new portfolio.
    await prisma.societyMembership.updateMany({
      where: { societyId: membership!.societyId, title: updated.name, role: { not: "EXECUTIVE" } },
      data: { portfolioId: updated.portfolioId },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, titleId } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const title = await prisma.societyTitle.findUnique({ where: { id: titleId } });
  if (!title || title.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.societyTitle.delete({ where: { id: titleId } });
  return NextResponse.json({ ok: true });
}
