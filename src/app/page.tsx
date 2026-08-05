import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function RootPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Single-society mode: go to the clean /dashboard (middleware rewrites it to
  // /slug/dashboard internally). Guard on membership using the SAME session data the
  // dashboard checks; otherwise a member-less/stale session loops /dashboard → / → …
  const envSlug = process.env.SOCIETY_SLUG;
  if (envSlug) {
    const hasMembership = (session.user as { memberships?: { society: { slug: string } }[] })
      .memberships?.some((m) => m.society.slug === envSlug);
    if (!hasMembership) redirect("/login?error=no-membership");
    redirect("/dashboard");
  }

  // Multi-society mode: redirect to the user's first active society
  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, isActive: true },
    include: { society: true },
  });

  if (membership) {
    redirect(`/${membership.society.slug}/dashboard`);
  }

  redirect("/setup");
}
