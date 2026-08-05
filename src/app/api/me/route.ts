import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api";
import bcrypt from "bcryptjs";
import { z } from "zod";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { id: true, name: true, email: true, zId: true, phone: true },
  });

  return NextResponse.json(user);
}

const schema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  // Required only when the email is actually being changed.
  currentPassword: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const data = schema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id: session!.user.id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const update: { name?: string; email?: string } = {};

    if (data.name && data.name !== user.name) {
      update.name = data.name;
    }

    if (data.email) {
      const email = data.email.trim().toLowerCase();
      if (email !== user.email) {
        // Changing the email is sensitive, so confirm with the account password.
        if (!user.passwordHash) {
          return NextResponse.json({ error: "Password not set on this account" }, { status: 400 });
        }
        if (!data.currentPassword) {
          return NextResponse.json({ error: "Current password is required to change your email" }, { status: 400 });
        }
        const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
        if (!valid) {
          return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
        }

        const taken = await prisma.user.findUnique({ where: { email } });
        if (taken) {
          return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
        }
        update.email = email;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: update,
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
