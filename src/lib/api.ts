import { auth } from "./auth";
import { prisma } from "./db";
import { NextResponse } from "next/server";
import type { Role, SocietyMembership, Society } from "@prisma/client";
import type { Session } from "next-auth";

export type RouteContext<T = Record<string, string>> = {
  params: Promise<T>;
};

type AuthResult =
  | { session: Session & { user: { id: string; name: string; email: string } }; error: null }
  | { session: null; error: NextResponse };

export async function requireAuth(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session: session as NonNullable<AuthResult["session"]>, error: null };
}

type MembershipResult =
  | { membership: SocietyMembership & { society: Society }; error: null }
  | { membership: null; error: NextResponse };

export async function requireMembership(
  userId: string,
  societySlug: string,
  minRole?: Role
): Promise<MembershipResult> {
  const membership = await prisma.societyMembership.findFirst({
    where: { userId, society: { slug: societySlug }, isActive: true },
    include: { society: true },
  });

  if (!membership) {
    return { membership: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (minRole) {
    const hierarchy: Record<Role, number> = { EXECUTIVE: 3, DIRECTOR: 2, SUBCOMMITTEE: 1 };
    if (hierarchy[membership.role] < hierarchy[minRole]) {
      return { membership: null, error: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }) };
    }
  }

  return { membership, error: null };
}

// DEMO_MODE (the public showcase stack) signs every visitor in as one shared
// account, so any write that changes that account's password or role locks the
// demo out for everyone until the next reseed. Refuse those, and only those —
// visitors are otherwise free to click around and create things.
/**
 * Refuses to change a user account (its password, its phone) when that account also
 * belongs to another society. Accounts are global but exec powers are per society, so
 * without this the exec of any society could add a stranger by email and reset their
 * password: a takeover of an account someone else's society relies on.
 */
export async function blockForeignAccountWrite(userId: string, societyId: string): Promise<NextResponse | null> {
  const elsewhere = await prisma.societyMembership.count({
    where: { userId, isActive: true, societyId: { not: societyId } },
  });
  if (!elsewhere) return null;
  return NextResponse.json(
    { error: "This person also belongs to another society, so only they can change their account" },
    { status: 403 }
  );
}

export async function blockDemoAccountWrite(userId: string): Promise<NextResponse | null> {
  if (process.env.DEMO_MODE !== "1") return null;
  const demoEmail = process.env.DEMO_EMAIL?.toLowerCase();
  if (!demoEmail) return null;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email.toLowerCase() !== demoEmail) return null;

  return NextResponse.json({ error: "The shared demo account cannot be modified" }, { status: 403 });
}
