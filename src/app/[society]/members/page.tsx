import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { InviteMemberDialog } from "@/components/shared/InviteMemberDialog";
import { EditMemberDialog } from "@/components/shared/EditMemberDialog";
import { EXEC_PORTFOLIO } from "@/lib/portfolios";

interface Props {
  params: Promise<{ society: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  EXECUTIVE: "Executives",
  DIRECTOR: "Directors",
  SUBCOMMITTEE: "Subcommittee",
};

// Sort order inside a portfolio: executives, then directors, then subcommittee.
const ROLE_ORDER: Record<string, number> = { EXECUTIVE: 0, DIRECTOR: 1, SUBCOMMITTEE: 2 };

const ROLE_COLORS: Record<string, string> = {
  EXECUTIVE: "bg-blue-100 text-blue-800",
  DIRECTOR: "bg-purple-100 text-purple-800",
  SUBCOMMITTEE: "bg-gray-100 text-gray-700",
};

export default async function MembersPage({ params }: Props) {
  const { society: societySlug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");
  // Members directory is exec-only.
  if (membership.role !== "EXECUTIVE") redirect(`/${societySlug}/dashboard`);

  const isExec = membership.role === "EXECUTIVE";

  const [members, portfolios] = await Promise.all([
    prisma.societyMembership.findMany({
      where: { societyId: membership.societyId, isActive: true },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, zId: true, phone: true } },
        portfolio: true,
      },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
    }),
    prisma.portfolio.findMany({
      where: { societyId: membership.societyId },
      orderBy: { name: "asc" },
    }),
  ]);

  // Role totals stay visible even though the list is grouped by portfolio.
  const roleTotals = {
    EXECUTIVE: members.filter((m) => m.role === "EXECUTIVE").length,
    DIRECTOR: members.filter((m) => m.role === "DIRECTOR").length,
    SUBCOMMITTEE: members.filter((m) => m.role === "SUBCOMMITTEE").length,
  };

  const portfolioList = portfolios.map((d) => ({ id: d.id, name: d.name }));

  // Executive portfolio first, then the rest alphabetically, then anyone unassigned.
  const groups = [
    ...portfolios
      .slice()
      .sort((a, b) =>
        a.name === EXEC_PORTFOLIO ? -1 : b.name === EXEC_PORTFOLIO ? 1 : a.name.localeCompare(b.name)
      )
      .map((p) => ({ key: p.id, name: p.name, members: members.filter((m) => m.portfolioId === p.id) })),
    { key: "none", name: "No portfolio", members: members.filter((m) => !m.portfolioId) },
  ]
    .filter((g) => g.members.length > 0)
    // Within a portfolio: executives, then directors, then subcommittee, by name.
    .map((g) => ({
      ...g,
      members: g.members
        .slice()
        .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.user.name.localeCompare(b.user.name)),
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Members</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{members.length} active members</p>
        </div>
        {isExec && <InviteMemberDialog societySlug={societySlug} portfolios={portfolioList} />}
      </div>

      {/* Role totals across the whole committee */}
      <div data-tour="member-totals" className="grid grid-cols-3 gap-3">
        {(["EXECUTIVE", "DIRECTOR", "SUBCOMMITTEE"] as const).map((role) => (
          <Card key={role}>
            <CardContent className="p-4">
              <p className="text-2xl font-bold tabnums">{roleTotals[role]}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{ROLE_LABELS[role]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {portfolios.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          This society has no portfolios yet, so everyone is listed as unassigned. Create them in{" "}
          <Link href={`/${societySlug}/settings`} className="font-medium underline">Settings</Link>, then
          assign people with the pencil on their card.
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {group.name}
            <span className="ml-2 text-xs normal-case bg-gray-100 px-2 py-0.5 rounded-full">{group.members.length}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.members.map((m, i) => (
              <Card key={m.id} data-tour={i === 0 && group.key === groups[0].key ? "member-card" : undefined}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <UserAvatar name={m.user.name} avatarUrl={m.user.avatarUrl} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-semibold truncate">{m.user.name}</p>
                        {isExec && (
                          <EditMemberDialog
                            societySlug={societySlug}
                            membershipId={m.id}
                            memberName={m.user.name}
                            memberPhone={m.user.phone ?? null}
                            currentRole={m.role}
                            currentTitle={m.title}
                            currentPortfolioId={m.portfolioId}
                            portfolios={portfolioList}
                          />
                        )}
                      </div>
                      {m.title && <p className="text-xs text-muted-foreground">{m.title}</p>}
                      <p className="text-xs text-muted-foreground truncate">{m.user.email}</p>
                      {m.user.zId && <p className="text-xs text-muted-foreground">{m.user.zId}</p>}
                      {m.user.phone && <p className="text-xs text-muted-foreground">{m.user.phone}</p>}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[m.role]}`}>
                          {m.role.toLowerCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

    </div>
  );
}
