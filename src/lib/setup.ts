import { createHash, timingSafeEqual } from "node:crypto";

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
