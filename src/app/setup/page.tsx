import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/branding";
import { setupTokenOk } from "@/lib/setup";
import { BrandMark } from "@/components/shared/BrandMark";
import { backupsEnabled } from "@/lib/debugTools";
import { FirstAccountForm } from "./FirstAccountForm";
import { FreshOrRestore } from "./FreshOrRestore";
import { CreateSocietyForm } from "./CreateSocietyForm";
import { SetupWizard } from "./SetupWizard";

// SETUP_TOKEN and SOCIETY_SLUG are read per request: one image serves every stack.
export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  // A fresh stack: no accounts yet. Only the installer's link gets in.
  if ((await prisma.user.count()) === 0) {
    const brand = await getBrand();
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <BrandMark brand={brand} />
            <h1 className="text-xl font-semibold tracking-tight">Set up your society portal</h1>
          </div>
          {setupTokenOk(token) ? (
            <FreshOrRestore token={token!} canRestore={backupsEnabled()}>
              <FirstAccountForm token={token!} defaultEmail={process.env.ADMIN_EMAIL ?? ""} />
            </FreshOrRestore>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              {process.env.SETUP_TOKEN
                ? "Open the setup link the installer printed. It ends in ?token=…"
                : "This portal has no accounts yet. Set SETUP_TOKEN in its .env file, restart it, then open /setup?token=<that value>."}
            </p>
          )}
        </div>
      </div>
    );
  }

  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/setup");

  const slug = process.env.SOCIETY_SLUG;
  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, isActive: true, ...(slug ? { society: { slug } } : { role: "EXECUTIVE" }) },
    orderBy: { joinedAt: "asc" },
    select: { role: true, society: { select: { slug: true, setupStep: true, setupCompletedAt: true } } },
  });
  if (!membership) {
    if (slug) redirect("/login?error=no-membership");
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
        <CreateSocietyForm />
      </div>
    );
  }
  const { society } = membership;
  if (membership.role !== "EXECUTIVE" || society.setupCompletedAt) redirect(`/${society.slug}/dashboard`);

  return <SetupWizard societySlug={society.slug} initialStep={society.setupStep} />;
}
