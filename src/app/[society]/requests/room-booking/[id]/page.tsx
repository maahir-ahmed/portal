import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ThreadView } from "@/components/requests/ThreadView";
import { StatusUpdater } from "@/components/requests/StatusUpdater";
import { ConfirmDelete } from "@/components/requests/ConfirmDelete";
import { BookedRoomCard } from "@/components/requests/BookedRoomCard";
import { formatDate, formatDateTime, isLateArcSubmission, EVENT_TYPE_LABELS } from "@/lib/utils";
import { ArrowLeft, AlertTriangle, Users, MapPin, Calendar, Clock, Pencil, Tag, DoorOpen } from "lucide-react";
import type { RoomBookingStatus } from "@prisma/client";

interface Props {
  params: Promise<{ society: string; id: string }>;
}

const LOCATION_LABELS: Record<string, string> = {
  LECTURE_THEATRE: "Lecture Theatre",
  CATS_ROOM: "CATS Room",
  SECLAB: "SecLab",
  ROUNDHOUSE: "Roundhouse",
  OUTDOOR_SPACE: "Outdoor Space",
  OTHER: "Other",
};

const STATUSES: RoomBookingStatus[] = [
  "SUBMITTED", "UNDER_REVIEW", "WAITING_ON_INFORMATION",
  "SUBMITTED_TO_ARC", "APPROVED", "REJECTED", "COMPLETED",
];

export default async function RoomBookingDetailPage({ params }: Props) {
  const { society: societySlug, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");

  const booking = await prisma.roomBooking.findUnique({
    where: { id },
    include: {
      submittedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
      thread: {
        include: {
          comments: {
            include: { author: { select: { id: true, name: true, avatarUrl: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!booking || booking.societyId !== membership.societyId) notFound();

  const isExec = membership.role === "EXECUTIVE";
  const isLate = isLateArcSubmission(booking.preferredDate, booking.status);

  const canEdit = isExec || booking.submittedById === session.user.id;
  // Arc names the room when it approves, so the field appears at that point.
  const roomOpen = booking.status === "APPROVED" || booking.status === "COMPLETED";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/${societySlug}/requests/room-booking`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold truncate">{booking.eventName}</h1>
            <StatusBadge status={booking.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Submitted by {booking.submittedBy.name} · {formatDateTime(booking.createdAt)}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button asChild variant="outline" size="sm">
              <Link href={`/${societySlug}/requests/room-booking/${booking.id}/edit`}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Link>
            </Button>
            <ConfirmDelete
              endpoint={`/api/societies/${societySlug}/room-bookings/${booking.id}`}
              redirect={`/${societySlug}/requests/room-booking`}
              title="Delete this room booking?"
              description="This permanently removes the booking request and its comments. If it was already submitted to Arc, cancel it there too. This cannot be undone."
              successMessage="Room booking deleted"
              confirmLabel="Delete booking"
            />
          </div>
        )}
      </div>

      {isLate && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Late Submission Warning</p>
            <p className="text-sm text-red-700 mt-0.5">
              Arc needs room bookings at least 7 business days before the event, and this one is inside that
              window. Please contact Arc immediately.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card data-tour="room-detail">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Event Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span><strong>Date:</strong> {formatDate(booking.preferredDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span><strong>Time:</strong> {booking.startTime} – {booking.endTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span><strong>Location:</strong> {LOCATION_LABELS[booking.preferredLocation]}</span>
                </div>
                {booking.assignedRoom && (
                  <div className="flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-green-700 flex-shrink-0" />
                    <span><strong>Booked room:</strong> {booking.assignedRoom}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span><strong>Max Attendees:</strong> {booking.maxAttendees}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span><strong>Event Type:</strong> {EVENT_TYPE_LABELS[booking.eventType]}</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Description</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{booking.description}</p>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Room Requirements</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{booking.roomRequirements}</p>
              </div>
            </CardContent>
          </Card>

          {booking.hasExternalGuests && (
            <Card className="border-orange-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" /> External Guests
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><strong>Number:</strong> {booking.numExternalGuests ?? "Not specified"}</p>
                <p><strong>Description:</strong></p>
                <p className="text-muted-foreground whitespace-pre-wrap">{booking.externalGuestsDesc}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Safety Officer</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p><strong>Name:</strong> {booking.safetyOfficerName}</p>
              <p><strong>zID:</strong> {booking.safetyOfficerZid}</p>
              <p><strong>Phone:</strong> {booking.safetyOfficerPhone}</p>
            </CardContent>
          </Card>

          <ThreadView
            comments={booking.thread?.comments ?? []}
            requestType="room-booking"
            requestId={booking.id}
            societySlug={societySlug}
            isExec={isExec}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Submitted by</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <UserAvatar name={booking.submittedBy.name} avatarUrl={booking.submittedBy.avatarUrl} />
                <div>
                  <p className="text-sm font-medium">{booking.submittedBy.name}</p>
                  <p className="text-xs text-muted-foreground">{booking.submittedBy.email}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Event Type:</strong> {EVENT_TYPE_LABELS[booking.eventType]}
              </p>
            </CardContent>
          </Card>

          {roomOpen && (
            <BookedRoomCard
              societySlug={societySlug}
              bookingId={booking.id}
              assignedRoom={booking.assignedRoom}
              canEdit={canEdit}
            />
          )}

          {isExec && (
            <StatusUpdater
              currentStatus={booking.status}
              statuses={STATUSES}
              apiPath={`/api/societies/${societySlug}/room-bookings/${booking.id}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
