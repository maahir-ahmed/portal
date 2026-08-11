import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, blockDemoAccountWrite } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import bcrypt from "bcryptjs";
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

    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }

    // Otherwise "changing" a temporary passphrase to itself would clear
    // mustChangePassword and leave the exec-issued credential live.
    if (data.newPassword === data.currentPassword) {
      return NextResponse.json({ error: "Your new password must be different" }, { status: 400 });
    }

    const passwordHash = await hashPassword(data.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
