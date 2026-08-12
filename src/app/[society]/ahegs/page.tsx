import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AhegsClient } from "@/components/ahegs/AhegsClient";
import { resolveRow } from "@/lib/ahegs";
import { Award } from "lucide-react";

interface Props {
  params: Promise<{ society: string }>;
  searchParams: Promise<{ year?: string }>;
}

// The submission is lodged once a year but collated all year, so the page is always
// a working document rather than a form: it derives the roster from the member
// directory every time and keeps only the corrections.
export default async function AhegsPage({ params, searchParams }: Props) {
  const { society: societySlug } = await params;
  const { year: yearParam } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
    include: { society: { select: { name: true } }, user: { select: { name: true, email: true, zId: true, phone: true } } },
  });
  if (!membership || membership.role !== "EXECUTIVE") redirect(`/${societySlug}/dashboard`);

  const now = new Date();
  const parsed = Number(yearParam);
  const year = Number.isInteger(parsed) && parsed > 2000 && parsed < 2100 ? parsed : now.getFullYear();

  const [memberships, entries, evidence] = await Promise.all([
    prisma.societyMembership.findMany({
      where: { societyId: membership.societyId },
      include: { user: { select: { name: true, email: true, zId: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.ahegsEntry.findMany({ where: { societyId: membership.societyId, year } }),
    prisma.ahegsEvidence.findMany({ where: { societyId: membership.societyId, year } }),
  ]);

  const overrides = new Map(entries.map((e) => [e.membershipId, e]));
  const rows = memberships.map((m) =>
    resolveRow(
      {
        membershipId: m.id,
        role: m.role,
        title: m.title,
        isActive: m.isActive,
        joinedAt: m.joinedAt,
        name: m.user.name,
        email: m.user.email,
        zId: m.user.zId,
      },
      overrides.get(m.id),
      year
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
          <Award className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">AHEGS</h1>
          <p className="text-sm text-muted-foreground">
            Clubs Contributing Members Recognition — collate through the year, submit at the end.
          </p>
        </div>
      </div>

      <AhegsClient
        societySlug={societySlug}
        year={year}
        years={[now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]}
        rows={rows}
        evidence={evidence.map((e) => ({ category: e.category, kind: e.kind, url: e.url, label: e.label }))}
        submitter={{
          name: membership.user.name,
          zid: (membership.user.zId ?? "").replace(/^z/i, ""),
          email: membership.user.email,
          phone: membership.user.phone ?? "",
          position: membership.title ?? "",
          club: membership.society.name,
        }}
      />
    </div>
  );
}
