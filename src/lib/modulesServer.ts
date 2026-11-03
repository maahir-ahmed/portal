import { prisma } from "./db";
import { ALL_ON, MODULE_SELECT, flagsFrom, type ModuleFlags } from "./modules";

// No cache: the proxy runs in its own module instance, so a cache here could not be
// cleared by the Settings save that runs in the route handler's, and a toggle would
// look broken until it expired. One lookup by unique slug is cheap beside the
// queries every page already makes.

/** Feature flags for a society by slug. An unknown slug reads as everything on. */
export async function modulesForSlug(slug: string): Promise<ModuleFlags> {
  const s = await prisma.society.findUnique({ where: { slug }, select: MODULE_SELECT });
  return s ? flagsFrom(s) : ALL_ON;
}

export async function modulesForSociety(societyId: string): Promise<ModuleFlags> {
  const s = await prisma.society.findUnique({ where: { id: societyId }, select: MODULE_SELECT });
  return s ? flagsFrom(s) : ALL_ON;
}
