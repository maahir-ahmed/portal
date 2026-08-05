import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { portfolioForTitle } from "@/lib/titles";
import { z } from "zod";

type Params = { society: string; membershipId: string };

const patchSchema = z.object({
  role: z.enum(["EXECUTIVE", "DIRECTOR", "SUBCOMMITTEE"]).optional(),
  title: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, membershipId } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const target = await prisma.societyMembership.findUnique({ where: { id: membershipId } });
  if (!target || target.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = patchSchema.parse(await req.json());

    // Role and title both feed the portfolio, so recompute it when either moves.
    const role = body.role ?? target.role;
    const title = body.title !== undefined ? body.title : target.title;
    const portfolioId =
      body.role !== undefined || body.title !== undefined
        ? await portfolioForTitle(membership!.societyId, title, role)
        : undefined;

    const [updated] = await Promise.all([
      prisma.societyMembership.update({
        where: { id: membershipId },
        data: {
          ...(body.role !== undefined && { role: body.role }),
          ...(body.title !== undefined && { title: body.title }),
          ...(portfolioId !== undefined && { portfolioId }),
        },
      }),
      body.phone !== undefined
        ? prisma.user.update({ where: { id: target.userId }, data: { phone: body.phone } })
        : Promise.resolve(),
    ]);

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "UPDATE",
      entityType: "SocietyMembership",
      entityId: membershipId,
      metadata: { role: body.role ?? null },
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

  const { society, membershipId } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const target = await prisma.societyMembership.findUnique({ where: { id: membershipId } });
  if (!target || target.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Prevent removing yourself
  if (target.userId === session!.user.id) {
    return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
  }

  await prisma.societyMembership.update({
    where: { id: membershipId },
    data: { isActive: false },
  });

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "DELETE",
    entityType: "SocietyMembership",
    entityId: membershipId,
    metadata: { removedUserId: target.userId },
  });

  return NextResponse.json({ ok: true });
}
