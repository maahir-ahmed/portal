import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { debugToolsEnabled } from "@/lib/debugTools";
import { modulesForSociety } from "@/lib/modulesServer";
import { SettingsTabs, type SettingsTab } from "@/components/settings/SettingsTabs";

// ENABLE_DEBUG_TOOLS and DEMO_MODE are read per request: one image serves every stack.
export const dynamic = "force-dynamic";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ society: string }>;
}) {
  const { society: societySlug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
    select: { role: true, societyId: true },
  });
  if (!membership) redirect("/");
  if (membership.role !== "EXECUTIVE") redirect(`/${societySlug}/dashboard`);

  const modules = await modulesForSociety(membership.societyId);
  const tabs: SettingsTab[] = [
    { href: "/general", label: "General" },
    { href: "/portfolios", label: "Portfolios & titles" },
    { href: "/features", label: "Features" },
    { href: "/policies", label: "Policies" },
    { href: "/members", label: "Import members" },
    { href: "/email", label: "Email" },
    { href: "/discord", label: "Discord" },
    ...(modules.ticketing ? [{ href: "/rubric", label: "Rubric" }] : []),
    ...(debugToolsEnabled() ? [{ href: "/debugging", label: "Debugging", danger: true }] : []),
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Society Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Set up how the portal works for your society</p>
      </div>
      <SettingsTabs prefix={`/${societySlug}/settings`} tabs={tabs} />
      {children}
    </div>
  );
}
