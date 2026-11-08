import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { backupsEnabled } from "./debugTools";

// First-run setup. A fresh stack has no accounts and no self-registration, so the
// first one is made at /setup with the SETUP_TOKEN the installer printed. The token
// only works while the database has no users at all: once that first account exists
// it is dead, and /setup belongs to that society's executives like any other page.

/** Whether `token` is this stack's SETUP_TOKEN. False when none is configured. */
export function setupTokenOk(token: unknown): boolean {
  const expected = process.env.SETUP_TOKEN;
  if (!expected || typeof token !== "string") return false;
  // Hashed first so the comparison is constant-time whatever the lengths.
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(token), h(expected));
}

/**
 * Restoring a backup instead of starting fresh, for a portal moving to a new machine.
 * Same credential as the first account: the setup token, while there are no accounts.
 */
export async function setupRestoreOk(req: Request): Promise<boolean> {
  return backupsEnabled() && setupTokenOk(req.headers.get("x-setup-token")) && (await prisma.user.count()) === 0;
}
