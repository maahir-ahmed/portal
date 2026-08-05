import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  FileText, Building2, Wallet, AlertCircle, Plus, Printer
} from "lucide-react";

interface Props {
  params: Promise<{ society: string }>;
}

export default async function DashboardPage({ params }: Props) {
  const { society: societySlug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
    include: { society: true },
  });
  if (!membership) redirect("/");

  const societyId = membership.societyId;
  const isExec = membership.role === "EXECUTIVE";

  const [
    contentPending,
    roomPending,
    treasuryPending,
    recentContent,
    recentRoom,
    recentTreasury,
  ] = await Promise.all([
    prisma.contentRequest.count({
      where: { societyId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    }),
    prisma.roomBooking.count({
      where: { societyId, status: { notIn: ["COMPLETED", "REJECTED"] } },
    }),
    prisma.treasuryRequest.count({
      // Claims are private to their submitter; only execs see everyone's.
      where: { societyId, status: { notIn: ["REIMBURSED", "REJECTED"] }, ...(isExec ? {} : { submittedById: session.user.id }) },
    }),
    prisma.contentRequest.findMany({
      where: { societyId },
      include: { submittedBy: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.roomBooking.findMany({
      where: { societyId },
      include: { submittedBy: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.treasuryRequest.findMany({
      where: { societyId, ...(isExec ? {} : { submittedById: session.user.id }) },
      include: { submittedBy: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const pendingTreasuryApprovals = isExec
    ? await prisma.treasuryRequest.count({
        where: { societyId, status: "AWAITING_APPROVAL" },
      })
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Welcome back, {session.user.name?.split(" ")[0]}
          </p>
        </div>
        <div data-tour="dash-actions" className="flex gap-2 flex-wrap">
          <Button asChild size="sm" variant="outline">
            <Link href={`/${societySlug}/requests/content/new`}>
              <Plus className="h-4 w-4 mr-1" /> Content Request
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/${societySlug}/requests/printing/new`}>
              <Printer className="h-4 w-4 mr-1" /> Printing Request
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/${societySlug}/requests/treasury/new`}>
              <Plus className="h-4 w-4 mr-1" /> Reimbursement
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div data-tour="dash-stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Open Content Requests" value={contentPending} icon={FileText} color="blue" />
        <StatsCard title="Pending Room Bookings" value={roomPending} icon={Building2} color="purple" />
        <StatsCard title="Active Reimbursements" value={treasuryPending} icon={Wallet} color="green" />
        {isExec && (
          <StatsCard title="Awaiting Your Approval" value={pendingTreasuryApprovals} icon={AlertCircle} color="yellow" />
        )}
      </div>

      {/* Recent Activity */}
      <div data-tour="dash-recent" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Content Requests */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Content Requests
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs h-7">
                <Link href={`/${societySlug}/requests/content`}>View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentContent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            ) : (
              recentContent.map((r) => (
                <Link key={r.id} href={`/${societySlug}/requests/content/${r.id}`} className="flex items-start gap-2 group">
                  <UserAvatar name={r.submittedBy.name} avatarUrl={r.submittedBy.avatarUrl} size="sm" className="mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-foreground">{r.eventName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-muted-foreground">{formatDate(r.deadline)}</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Room Bookings */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Room Bookings
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs h-7">
                <Link href={`/${societySlug}/requests/room-booking`}>View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentRoom.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              recentRoom.map((r) => (
                <Link key={r.id} href={`/${societySlug}/requests/room-booking/${r.id}`} className="flex items-start gap-2 group">
                  <UserAvatar name={r.submittedBy.name} avatarUrl={r.submittedBy.avatarUrl} size="sm" className="mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-foreground">{r.eventName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-muted-foreground">{formatDate(r.preferredDate)}</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Treasury */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Treasury
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs h-7">
                <Link href={`/${societySlug}/requests/treasury`}>View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentTreasury.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reimbursements yet.</p>
            ) : (
              recentTreasury.map((r) => (
                <Link key={r.id} href={`/${societySlug}/requests/treasury/${r.id}`} className="flex items-start gap-2 group">
                  <UserAvatar name={r.submittedBy.name} avatarUrl={r.submittedBy.avatarUrl} size="sm" className="mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-foreground">{r.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusBadge status={r.status} />
                      <span className="text-xs font-medium text-green-700">{formatCurrency(Number(r.amount))}</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
