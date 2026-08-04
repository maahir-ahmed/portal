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
