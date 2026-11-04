import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, blockDemoAccountWrite } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { auditAccountChange } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { isLimited, passwordLimits, recordFailure } from "@/lib/rateLimit";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const demoBlocked = await blockDemoAccountWrite(session!.user.id);
  if (demoBlocked) return demoBlocked;

  try {
    const data = schema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id: session!.user.id } });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Password not set on this account" }, { status: 400 });
    }

    // A stolen session must not become unlimited guesses at the password.
    const limits = passwordLimits(user.email, req.headers);
    if (isLimited(limits)) {
      return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    }
    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!valid) {
      recordFailure(limits);
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }

    // Otherwise "changing" a temporary passphrase to itself would clear
    // mustChangePassword and leave the exec-issued credential live.
    if (data.newPassword === data.currentPassword) {
      return NextResponse.json({ error: "Your new password must be different" }, { status: 400 });
    }

    // Signs out every other device. The caller signs in again with the new password.
    const passwordHash = await hashPassword(data.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
    });

    await auditAccountChange(user.id, "Password");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
