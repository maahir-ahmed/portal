import { prisma } from "./db";
import type { Role } from "@prisma/client";

// A member's main portfolio always follows their title, so it is derived here rather
// than accepted from the client. Executives hold no portfolio, whatever title they
// have; a title that isn't in the society's list leaves them unassigned.
export async function portfolioForTitle(
  societyId: string,
  title: string | null | undefined,
  role: Role
): Promise<string | null> {
  if (role === "EXECUTIVE" || !title) return null;

  const match = await prisma.societyTitle.findFirst({
    where: { societyId, name: title },
    select: { portfolioId: true },
  });
  return match?.portfolioId ?? null;
}

// Select this alongside a membership to read its portfolios with memberPortfolioIds.
export const EXTRA_PORTFOLIOS = { extraPortfolios: { select: { portfolioId: true } } } as const;

/**
 * Every portfolio a member is in: the one their title gives them, then any they were
 * added to by hand. Use this, not portfolioId alone, wherever "is this member in
 * that portfolio" matters.
 */
export function memberPortfolioIds(m: {
  portfolioId: string | null;
  extraPortfolios?: { portfolioId: string }[];
}): string[] {
  const ids = m.portfolioId ? [m.portfolioId] : [];
  for (const e of m.extraPortfolios ?? []) if (!ids.includes(e.portfolioId)) ids.push(e.portfolioId);
  return ids;
}
