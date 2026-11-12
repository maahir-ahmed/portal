import { requirePageMember } from "@/lib/pageAccess";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { bookingDecided } from "@/lib/utils";
import { RoomBookingForm } from "@/components/requests/RoomBookingForm";

interface Props {
  params: Promise<{ society: string; id: string }>;
}

export default async function EditRoomBookingPage({ params }: Props) {
  const { society: societySlug, id } = await params;
  const { session, membership } = await requirePageMember(societySlug);

  const booking = await prisma.roomBooking.findUnique({ where: { id } });
  if (!booking || booking.societyId !== membership.societyId) notFound();

  const isOwner = booking.submittedById === session.user.id;
  const isExec = membership.role === "EXECUTIVE";
  // As the detail page offers Edit: an owner can't edit once Arc has decided, which a save refuses.
  if ((!isOwner && !isExec) || (!isExec && bookingDecided(booking.status))) {
    redirect(`/${societySlug}/requests/room-booking/${id}`);
  }

  return (
    <RoomBookingForm
      societySlug={societySlug}
      initial={{
        id: booking.id,
        eventName: booking.eventName,
        preferredDate: booking.preferredDate.toISOString(),
        startTime: booking.startTime,
        endTime: booking.endTime,
        description: booking.description,
        maxAttendees: booking.maxAttendees,
        hasExternalGuests: booking.hasExternalGuests,
        externalGuestsDesc: booking.externalGuestsDesc,
        numExternalGuests: booking.numExternalGuests,
        eventType: booking.eventType,
        preferredLocation: booking.preferredLocation,
        safetyOfficerName: booking.safetyOfficerName,
        safetyOfficerZid: booking.safetyOfficerZid,
        safetyOfficerPhone: booking.safetyOfficerPhone,
        roomRequirements: booking.roomRequirements,
      }}
    />
  );
}
