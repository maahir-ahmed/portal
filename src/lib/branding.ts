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
 * (SOCIETY_SLUG), never from the code. Uploaded logos live behind auth in /uploads,
 * so only a logo from /public can be shown to someone not yet signed in.
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
    const publicLogo = society.logoUrl?.startsWith("/") && !society.logoUrl.startsWith("/uploads/");
    return { name: society.name, logo: publicLogo ? society.logoUrl : null };
  } catch {
    return FALLBACK; // no database at build time, when static pages are prerendered
  }
}
