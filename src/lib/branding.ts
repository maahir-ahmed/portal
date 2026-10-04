import { prisma } from "./db";

export interface Brand {
  name: string;
  /** A logo anyone can load, or null to draw the name's initials instead. */
  logo: string | null;
}

const FALLBACK: Brand = { name: "Society Portal", logo: null };

/**
 * The name and logo for pages shown before sign-in (login, 404, the tab title). One
 * image serves several societies, so this comes from the stack's own society row
 * (SOCIETY_SLUG), never from the code. An uploaded logo works too: the uploads route
 * serves a society's current logo without a login.
 */
export async function getBrand(): Promise<Brand> {
  try {
    const slug = process.env.SOCIETY_SLUG;
    const society = await prisma.society.findFirst({
      where: slug ? { slug } : {},
      orderBy: { createdAt: "asc" },
      select: { name: true, logoUrl: true },
    });
    if (!society) return FALLBACK;
    // Same-origin paths only (/public files and /uploads), never an outside URL.
    const logo = society.logoUrl?.startsWith("/") && !society.logoUrl.startsWith("//") ? society.logoUrl : null;
    return { name: society.name, logo };
  } catch {
    return FALLBACK; // no database at build time, when static pages are prerendered
  }
}
