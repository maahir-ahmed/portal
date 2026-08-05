import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  zId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = schema.parse(body);

    // Normalise the email so it matches the lookup done at login time
    // (Postgres equality is case-sensitive; otherwise "John@x" can't sign in as "john@x").
    const email = data.email.trim().toLowerCase();
    const zId = data.zId?.trim() || undefined;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await hashPassword(data.password);

    // In single-society deployments (SOCIETY_SLUG set) a user with no membership is
    // bounced straight back to /login?error=no-membership and can never use the portal.
    // Auto-enrol new registrations into that society so the account is a real login.
    const societySlug = process.env.SOCIETY_SLUG?.trim();
    const society = societySlug
      ? await prisma.society.findUnique({ where: { slug: societySlug }, select: { id: true } })
      : null;

    await prisma.user.create({
      data: {
        name: data.name,
        email,
        passwordHash,
        zId,
        ...(society
          ? { memberships: { create: { societyId: society.id, role: "SUBCOMMITTEE" } } }
          : {}),
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
