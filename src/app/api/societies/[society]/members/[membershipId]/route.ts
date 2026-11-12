import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership, blockDemoAccountWrite, blockForeignAccountWrite, serverError } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { portfolioForTitle } from "@/lib/titles";
import { z } from "zod";

type Params = { society: string; membershipId: string };

const patchSchema = z.object({
  role: z.enum(["EXECUTIVE", "DIRECTOR", "SUBCOMMITTEE"]).optional(),
  title: z.string().max(100).nullable().optional(),
  phone: z.string().nullable().optional(),
  // Portfolios beyond the title's own. Replaces the whole set when sent.
  extraPortfolioIds: z.array(z.string()).max(50).optional(),
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

  const demoBlocked = await blockDemoAccountWrite(target.userId);
  if (demoBlocked) return demoBlocked;

  try {
    const body = patchSchema.parse(await req.json());

    // Without an executive nobody can reach Members or Settings to fix it.
    if (target.role === "EXECUTIVE" && body.role && body.role !== "EXECUTIVE") {
      const others = await prisma.societyMembership.count({
        where: { societyId: target.societyId, role: "EXECUTIVE", isActive: true, id: { not: target.id } },
      });
      if (others === 0) {
        return NextResponse.json({ error: "Make someone else an executive first" }, { status: 400 });
      }
    }

    // Role and title both feed the portfolio, so recompute it when either moves.
    const role = body.role ?? target.role;
    const title = body.title !== undefined ? body.title : target.title;
    const portfolioId =
      body.role !== undefined || body.title !== undefined
        ? await portfolioForTitle(membership!.societyId, title, role)
        : undefined;

    // The phone is on the account, which may also belong to another society.
    // Checked before any write so a refusal changes nothing.
    if (body.phone !== undefined) {
      const foreign = await blockForeignAccountWrite(target.userId, membership!.societyId);
      if (foreign) return foreign;
    }

    let extraIds: string[] | undefined;
    if (body.extraPortfolioIds) {
      // The title's own portfolio is implied, so it is never stored twice.
      const fromTitle = portfolioId !== undefined ? portfolioId : target.portfolioId;
      extraIds = [...new Set(body.extraPortfolioIds)].filter((id) => id !== fromTitle);
      const known = await prisma.portfolio.count({ where: { id: { in: extraIds }, societyId: membership!.societyId } });
      if (known !== extraIds.length) return NextResponse.json({ error: "Unknown portfolio" }, { status: 400 });
    }

    // One transaction: portfolios, membership and phone all change or none do.
    const updated = await prisma.$transaction(async (tx) => {
      if (extraIds) {
        await tx.memberPortfolio.deleteMany({ where: { membershipId } });
        await tx.memberPortfolio.createMany({ data: extraIds.map((portfolioId) => ({ membershipId, portfolioId })) });
      }
      if (body.phone !== undefined) {
        await tx.user.update({ where: { id: target.userId }, data: { phone: body.phone } });
      }
      return tx.societyMembership.update({
        where: { id: membershipId },
        data: {
          ...(body.role !== undefined && { role: body.role }),
          ...(body.title !== undefined && { title: body.title }),
          ...(portfolioId !== undefined && { portfolioId }),
        },
      });
    });

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "UPDATE",
      entityType: "SocietyMembership",
      entityId: membershipId,
      metadata: { role: body.role ?? null, title: body.title ?? null, extraPortfolios: body.extraPortfolioIds?.length ?? null },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return serverError(err);
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

  // Same guard as PATCH and reset-password: on the demo, a visitor could otherwise
  // add themselves as an exec and remove the shared account everyone signs in with.
  const demoBlocked = await blockDemoAccountWrite(target.userId);
  if (demoBlocked) return demoBlocked;

  await prisma.societyMembership.update({
    where: { id: membershipId },
    data: { isActive: false },
  });
  // Their session still lists this society; end it so the next sign-in drops it.
  await prisma.user.update({ where: { id: target.userId }, data: { sessionVersion: { increment: 1 } } });

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
