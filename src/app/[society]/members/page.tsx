import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { InviteMemberDialog } from "@/components/shared/InviteMemberDialog";
import { EditMemberDialog } from "@/components/shared/EditMemberDialog";

interface Props {
  params: Promise<{ society: string }>;
}

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

  const [members, departments] = await Promise.all([
    prisma.societyMembership.findMany({
      where: { societyId: membership.societyId, isActive: true },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, zId: true, phone: true } },
        department: true,
      },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
    }),
    prisma.department.findMany({
      where: { societyId: membership.societyId },
      orderBy: { name: "asc" },
    }),
  ]);

  const groupedByRole = {
    EXECUTIVE: members.filter((m) => m.role === "EXECUTIVE"),
    DIRECTOR: members.filter((m) => m.role === "DIRECTOR"),
    SUBCOMMITTEE: members.filter((m) => m.role === "SUBCOMMITTEE"),
  };

  const deptList = departments.map((d) => ({ id: d.id, name: d.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Members</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{members.length} active members</p>
        </div>
        {isExec && <InviteMemberDialog societySlug={societySlug} departments={deptList} />}
      </div>

      {(["EXECUTIVE", "DIRECTOR", "SUBCOMMITTEE"] as const).map((role) => {
        const group = groupedByRole[role];
        if (group.length === 0) return null;
        return (
          <section key={role}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {role === "EXECUTIVE" ? "Executives" : role === "DIRECTOR" ? "Directors" : "Subcommittee"}
              <span className="ml-2 text-xs normal-case bg-gray-100 px-2 py-0.5 rounded-full">{group.length}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.map((m, i) => (
                <Card key={m.id} data-tour={i === 0 ? "member-card" : undefined}>
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
                              currentDepartmentId={m.departmentId}
                              departments={deptList}
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
                          {m.department && (
                            <span className="text-xs bg-gray-50 text-gray-600 border px-2 py-0.5 rounded-full">
                              {m.department.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
