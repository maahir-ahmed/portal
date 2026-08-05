import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

type Params = { society: string; membershipId: string };

// Exec resets a member's password to a random temp value, returned once so the
// exec can hand it over. The user changes it in My Account after logging in.
// Note: doesn't invalidate existing sessions; add if a reset must force logout
export async function POST(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, membershipId } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const target = await prisma.societyMembership.findUnique({ where: { id: membershipId } });
  if (!target || target.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tempPassword = randomBytes(6).toString("base64url");
  await prisma.user.update({
    where: { id: target.userId },
    data: { passwordHash: await hashPassword(tempPassword) },
  });

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "UPDATE",
    entityType: "User",
    entityId: target.userId,
    metadata: { action: "password_reset" },
  });

  return NextResponse.json({ tempPassword });
}
