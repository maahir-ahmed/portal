import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { RoomBookingForm } from "@/components/requests/RoomBookingForm";

interface Props {
  params: Promise<{ society: string; id: string }>;
}

export default async function EditRoomBookingPage({ params }: Props) {
  const { society: societySlug, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");

  const booking = await prisma.roomBooking.findUnique({ where: { id } });
  if (!booking || booking.societyId !== membership.societyId) notFound();

  const isOwner = booking.submittedById === session.user.id;
  if (!isOwner && membership.role !== "EXECUTIVE") redirect(`/${societySlug}/requests/room-booking/${id}`);

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
