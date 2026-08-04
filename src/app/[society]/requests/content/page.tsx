import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatDate, formatTimeRange, statusLabel, cn } from "@/lib/utils";
import { Plus, FileText, Image as ImageIcon, AlignLeft, QrCode, Calendar, Clock, MapPin } from "lucide-react";
import type { ContentRequestStatus } from "@prisma/client";

interface Props {
  params: Promise<{ society: string }>;
  searchParams: Promise<{ status?: string }>;
}

// Tab order — ASSIGNED / Awaiting exec action removed; "Need more information" sits before In Progress.
const TABS: ContentRequestStatus[] = [
  "SUBMITTED",
  "AWAITING_INFORMATION",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

const CLOSED = new Set(["COMPLETED", "CANCELLED"]);

// Whole-card highlight (bg + border) based on how close the content is due.
function proximityClasses(dueDate: Date, status: string): string {
  if (CLOSED.has(status)) return "border-l-zinc-200";
  const days = Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "border-l-red-600 border-red-200 bg-red-100";       // overdue
  if (days <= 2) return "border-l-red-500 border-red-200 bg-red-50";        // imminent
  if (days <= 6) return "border-l-amber-500 border-amber-200 bg-amber-50";   // this week
  if (days <= 14) return "border-l-yellow-400 border-yellow-200 bg-yellow-50"; // soon
  return "border-l-emerald-500 border-emerald-200 bg-emerald-50";           // plenty of time
}

function daysLabel(dueDate: Date, status: string): string | null {
  if (CLOSED.has(status)) return null;
  const days = Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

export default async function ContentRequestsPage({ params, searchParams }: Props) {
  const { society: societySlug } = await params;
  const { status } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");

  const canSeeAll = membership.role === "EXECUTIVE" || membership.role === "DIRECTOR";
  const scope = {
    societyId: membership.societyId,
    ...(!canSeeAll ? { submittedById: session.user.id } : {}),
  };

  const [rows, counts] = await Promise.all([
    prisma.contentRequest.findMany({
      where: { ...scope, ...(status ? { status: status as ContentRequestStatus } : {}) },
      include: { submittedBy: { select: { id: true, name: true, avatarUrl: true } } },
    }),
    prisma.contentRequest.groupBy({ by: ["status"], where: scope, _count: true }),
  ]);

  const countFor = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const totalCount = counts.reduce((a, c) => a + c._count, 0);

  // Open requests first (soonest due first), then closed ones newest-to-oldest.
  const requests = rows.sort((a, b) => {
    const aClosed = CLOSED.has(a.status) ? 1 : 0;
    const bClosed = CLOSED.has(b.status) ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
    return aClosed
      ? b.startDate.getTime() - a.startDate.getTime()   // completed/cancelled: newest first
      : a.deadline.getTime() - b.deadline.getTime();     // open: soonest due first
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content Requests / Events</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Marketing &amp; promotional requests, linked to Rubric events</p>
        </div>
        <Button asChild>
          <Link href={`/${societySlug}/requests/content/new`}>
            <Plus className="h-4 w-4 mr-2" /> New Request
          </Link>
        </Button>
      </div>

      {/* Status filter with counts */}
      <div className="flex gap-2 flex-wrap">
        <Link href={`/${societySlug}/requests/content`}>
          <Button variant={!status ? "default" : "outline"} size="sm" className="gap-1.5">
            All <span className={cn("tabnums text-xs", !status ? "opacity-70" : "text-muted-foreground")}>{totalCount}</span>
          </Button>
        </Link>
        {TABS.map((s) => (
          <Link key={s} href={`/${societySlug}/requests/content?status=${s}`}>
            <Button variant={status === s ? "default" : "outline"} size="sm" className="gap-1.5">
              {statusLabel(s)}
              <span className={cn("tabnums text-xs", status === s ? "opacity-70" : "text-muted-foreground")}>{countFor(s)}</span>
            </Button>
          </Link>
        ))}
      </div>

      {/* Request list */}
      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">No content requests found.</p>
            <Button asChild size="sm">
              <Link href={`/${societySlug}/requests/content/new`}>Create your first request</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {requests.map((r) => {
            const label = daysLabel(r.deadline, r.status);
            return (
              <Link key={r.id} href={`/${societySlug}/requests/content/${r.id}`}>
                <Card className={cn("border-l-4 hover:shadow-[0_2px_8px_-2px_rgba(16,16,20,0.08)] transition-shadow cursor-pointer", proximityClasses(r.deadline, r.status), CLOSED.has(r.status) && "opacity-70")}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <UserAvatar name={r.submittedBy.name} avatarUrl={r.submittedBy.avatarUrl} size="sm" className="mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{r.eventName}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(r.startDate)}</span>
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {formatTimeRange(r.startDate, r.endDate)}</span>
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {r.location}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {r.bannerRequired && (
                              <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md", r.bannerDone ? "bg-green-100 text-green-700" : "bg-secondary text-secondary-foreground")}><ImageIcon className="h-3 w-3" /> Banner</span>
                            )}
                            {r.blurbRequired && (
                              <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md", r.blurbDone ? "bg-green-100 text-green-700" : "bg-secondary text-secondary-foreground")}><AlignLeft className="h-3 w-3" /> Blurb</span>
                            )}
                            {r.rubricRequired && (
                              <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md", (r.rubricEventLink || r.rubricSubmittedAt) ? "bg-green-100 text-green-700" : "bg-secondary text-secondary-foreground")}><QrCode className="h-3 w-3" /> Rubric</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <StatusBadge status={r.status} />
                        {label && (
                          <span className="text-[11px] font-medium text-muted-foreground tabnums">{label}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
