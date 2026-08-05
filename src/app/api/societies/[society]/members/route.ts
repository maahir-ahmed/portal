import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { portfolioForTitle } from "@/lib/titles";
import { generatePassphrase } from "@/lib/passphrase";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["EXECUTIVE", "DIRECTOR", "SUBCOMMITTEE"]),
  title: z.string().nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());

    const portfolioId = await portfolioForTitle(membership!.societyId, body.title, body.role);

    let user = await prisma.user.findUnique({ where: { email: body.email } });
    let tempPassword: string | null = null;

    if (!user) {
      // Temporary passphrase, handed to the member out of band. mustChangePassword
      // blocks the app on a change-password dialog until they replace it.
      tempPassword = generatePassphrase();
      user = await prisma.user.create({
        data: {
          email: body.email,
          name: body.name,
          passwordHash: await hashPassword(tempPassword),
          mustChangePassword: true,
        },
      });
    }

    const existing = await prisma.societyMembership.findUnique({
      where: { userId_societyId: { userId: user.id, societyId: membership!.societyId } },
    });

    if (existing) {
      if (existing.isActive) {
        return NextResponse.json({ error: "User is already a member" }, { status: 409 });
      }
      await prisma.societyMembership.update({
        where: { id: existing.id },
        data: { isActive: true, role: body.role, title: body.title ?? null, portfolioId },
      });
    } else {
      await prisma.societyMembership.create({
        data: {
          userId: user.id,
          societyId: membership!.societyId,
          role: body.role,
          title: body.title ?? null,
          portfolioId,
        },
      });
    }

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "CREATE",
      entityType: "SocietyMembership",
      entityId: user.id,
      metadata: { addedEmail: body.email, role: body.role },
    });

    return NextResponse.json({ ok: true, tempPassword }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
