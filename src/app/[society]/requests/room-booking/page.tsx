import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatDate, isLateArcSubmission } from "@/lib/utils";
import { Plus, Building2, AlertTriangle, Calendar, Clock, MapPin, Users } from "lucide-react";

interface Props {
  params: Promise<{ society: string }>;
}

export default async function RoomBookingsPage({ params }: Props) {
  const { society: societySlug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");

  const canSeeAll = membership.role === "EXECUTIVE" || membership.role === "DIRECTOR";

  const bookings = await prisma.roomBooking.findMany({
    where: {
      societyId: membership.societyId,
      ...(!canSeeAll ? { submittedById: session.user.id } : {}),
    },
    include: {
      submittedBy: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { preferredDate: "asc" },
  });

  const locationLabels: Record<string, string> = {
    LECTURE_THEATRE: "Lecture Theatre",
    CATS_ROOM: "CATS Room",
    SECLAB: "SecLab",
    ROUNDHOUSE: "Roundhouse",
    OUTDOOR_SPACE: "Outdoor Space",
    OTHER: "Other",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Room Booking Requests</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Arc room and resource bookings</p>
        </div>
        <Button asChild>
          <Link href={`/${societySlug}/requests/room-booking/new`}>
            <Plus className="h-4 w-4 mr-2" /> New Booking
          </Link>
        </Button>
      </div>

      {bookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Building2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">No room bookings found.</p>
            <Button asChild size="sm">
              <Link href={`/${societySlug}/requests/room-booking/new`}>Submit first booking</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const isLate = b.hasExternalGuests && isLateArcSubmission(b.preferredDate);
            return (
              <Link key={b.id} href={`/${societySlug}/requests/room-booking/${b.id}`}>
                <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <UserAvatar name={b.submittedBy.name} avatarUrl={b.submittedBy.avatarUrl} size="sm" className="mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{b.eventName}</p>
                            {isLate && (
                              <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex-shrink-0">
                                <AlertTriangle className="h-3 w-3" /> Late submission
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(b.preferredDate)}</span>
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {b.startTime} – {b.endTime}</span>
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {locationLabels[b.preferredLocation]}</span>
                            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {b.maxAttendees} max</span>
                            {b.hasExternalGuests && (
                              <span className="inline-flex items-center gap-1 text-orange-600"><AlertTriangle className="h-3 w-3" /> External guests</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <StatusBadge status={b.status} />
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
