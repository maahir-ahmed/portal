import { prisma } from "./db";
import type { Role } from "@prisma/client";

// A member's portfolio always follows their title, so it is derived here rather
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
