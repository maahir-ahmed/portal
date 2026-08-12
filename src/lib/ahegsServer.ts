import { prisma } from "./db";
import { requireAuth, requireMembership } from "./api";
import { ahegsScope, canTouchPortfolio, type AhegsScope } from "./ahegs";
import type { NextResponse } from "next/server";
import type { Session } from "next-auth";
import type { Society, SocietyMembership } from "@prisma/client";

type Access =
  | { error: NextResponse; session: null; membership: null; scope: null }
  | {
      error: null;
      session: Session & { user: { id: string; name: string; email: string } };
      membership: SocietyMembership & { society: Society };
      scope: AhegsScope;
    };

/**
 * AHEGS is director-and-above: subcommittee members have no access at all, so
 * `DIRECTOR` is the floor for the page and every route under it. The returned scope
 * is what limits a director to their own portfolio.
 */
export async function requireAhegsAccess(society: string): Promise<Access> {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return { error: authErr, session: null, membership: null, scope: null };

  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "DIRECTOR");
  if (memErr) return { error: memErr, session: null, membership: null, scope: null };

  return {
    error: null,
    session: session!,
    membership: membership!,
    scope: ahegsScope(membership!.role, membership!.portfolioId),
  };
}

/**
 * Resolves memberships by id and confirms the caller may touch every one of them.
 * Returns null if any is outside the society or outside a director's portfolio —
 * the check that stops a director reaching another portfolio by guessing an id.
 */
export async function membershipsInScope(societyId: string, scope: AhegsScope, ids: string[]) {
  if (ids.length === 0) return [];
  const found = await prisma.societyMembership.findMany({
    where: { id: { in: ids }, societyId },
    select: { id: true, portfolioId: true },
  });
  if (found.length !== new Set(ids).size) return null;
  return found.every((m) => canTouchPortfolio(scope, m.portfolioId)) ? found : null;
}
