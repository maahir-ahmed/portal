import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AhegsClient } from "@/components/ahegs/AhegsClient";
import { ahegsScope, canTouchPortfolio, resolveRow } from "@/lib/ahegs";
import { Award } from "lucide-react";

interface Props {
  params: Promise<{ society: string }>;
  searchParams: Promise<{ year?: string }>;
}

// The submission is lodged once a year but collated all year, so the page is always
// a working document rather than a form: it derives the roster from the member
// directory every time and keeps only the corrections.
//
// Executives see the whole club. Directors see their own portfolio, themselves
// included. Subcommittee members don't get here at all.
export default async function AhegsPage({ params, searchParams }: Props) {
  const { society: societySlug } = await params;
  const { year: yearParam } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
    include: {
      society: { select: { name: true } },
      user: { select: { name: true, email: true, zId: true, phone: true } },
    },
  });
  if (!membership || membership.role === "SUBCOMMITTEE") redirect(`/${societySlug}/dashboard`);

  const scope = ahegsScope(membership.role, membership.portfolioId);
  const now = new Date();
  const parsed = Number(yearParam);
  const year = Number.isInteger(parsed) && parsed > 2000 && parsed < 2100 ? parsed : now.getFullYear();

  const [memberships, entries, evidence, allMeetings, portfolios] = await Promise.all([
    prisma.societyMembership.findMany({
      where: { societyId: membership.societyId },
      include: { user: { select: { name: true, email: true, zId: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.ahegsEntry.findMany({ where: { societyId: membership.societyId, year } }),
    scope.isExec
      ? prisma.ahegsEvidence.findMany({ where: { societyId: membership.societyId, year } })
      : Promise.resolve([]),
    // Every meeting, because hours must total the same number whoever is looking —
    // a director's people can also attend committee-wide meetings they can't edit.
    prisma.ahegsMeeting.findMany({
      where: { societyId: membership.societyId, year },
      include: { attendees: { select: { membershipId: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.portfolio.findMany({
      where: { societyId: membership.societyId },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const attendance = allMeetings.map((m) => ({
    hours: m.hours,
    attendeeIds: m.attendees.map((a) => a.membershipId),
  }));

  const overrides = new Map(entries.map((e) => [e.membershipId, e]));
  const rows = memberships
    .map((m) =>
      resolveRow(
        {
          membershipId: m.id,
          role: m.role,
          portfolioId: m.portfolioId,
          title: m.title,
          isActive: m.isActive,
          joinedAt: m.joinedAt,
          name: m.user.name,
          email: m.user.email,
          zId: m.user.zId,
        },
        overrides.get(m.id),
        year,
        attendance
      )
    )
    // A director sees only their own portfolio. Filtering here, on the server, means
    // the other portfolios' names, zIDs and emails never reach their browser.
    .filter((r) => canTouchPortfolio(scope, r.portfolioId));

  // Same rule for the meetings list: hours counted everything, but only meetings the
  // caller owns are sent down, so another portfolio's minutes stay private.
  const meetings = allMeetings
    .filter((m) => canTouchPortfolio(scope, m.portfolioId))
    .map((m) => ({
      id: m.id,
      portfolioId: m.portfolioId,
      title: m.title,
      date: m.date.toISOString().slice(0, 10),
      hours: m.hours,
      fileUrl: m.fileUrl,
      fileName: m.fileName,
      attendeeIds: m.attendees.map((a) => a.membershipId),
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
          <Award className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">AHEGS</h1>
          <p className="text-sm text-muted-foreground">
            {scope.isExec
              ? "Clubs Contributing Members Recognition — collate through the year, submit at the end."
              : "Log your portfolio's meetings and minutes. Hours build up towards each member's recognition."}
          </p>
        </div>
      </div>

      <AhegsClient
        societySlug={societySlug}
        year={year}
        years={[now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]}
        scope={scope}
        rows={rows}
        meetings={meetings}
        portfolios={portfolios}
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
