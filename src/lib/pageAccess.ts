import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

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
