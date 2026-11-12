import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";

// A page checks its own access: a layout check does not cover a page rendered on its own
// (Next's authentication guide says so). Executives of this society only.
export async function requireExecPage(societySlug: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
    select: { role: true, societyId: true },
  });
  if (!membership) redirect("/");
  if (membership.role !== "EXECUTIVE") redirect(`/${societySlug}/dashboard`);
  return { userId: session.user.id, societyId: membership.societyId };
}

/**
 * The top of a society page: sign-in, then an active membership of the society in the URL.
 * A non-member goes to "/", and with `execOnly` a member who is not an executive goes to
 * the dashboard. `args` is the page's own `include` (a `select` must carry `role` when
 * `execOnly` is set).
 */
export async function requirePageMember<A extends Prisma.SocietyMembershipDefaultArgs>(
  societySlug: string,
  args?: A,
  execOnly = false
) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const membership = (await prisma.societyMembership.findFirst({
    ...args,
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  })) as Prisma.SocietyMembershipGetPayload<A> | null;
  if (!membership) redirect("/");
  if (execOnly && (membership as { role?: string }).role !== "EXECUTIVE") redirect(`/${societySlug}/dashboard`);
  return { session: session as Session & { user: { id: string } }, membership };
}
