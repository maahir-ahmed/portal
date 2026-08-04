"use client";

import { useParams } from "next/navigation";
import { RoomBookingForm } from "@/components/requests/RoomBookingForm";

export default function NewRoomBookingPage() {
  const params = useParams<{ society: string }>();
  return <RoomBookingForm societySlug={params.society} />;
}
