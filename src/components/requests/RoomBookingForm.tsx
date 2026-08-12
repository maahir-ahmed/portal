"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeSelect } from "@/components/ui/datetime";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const LOCATIONS = [
  { value: "LECTURE_THEATRE", label: "Lecture Theatre" },
  { value: "CATS_ROOM", label: "CATS Room" },
  { value: "SECLAB", label: "SecLab" },
  { value: "ROUNDHOUSE", label: "Roundhouse" },
  { value: "OUTDOOR_SPACE", label: "Outdoor Space" },
  { value: "OTHER", label: "Other" },
];

export interface RoomBookingInitial {
  id: string;
  eventName: string;
  preferredDate: string;
  startTime: string;
  endTime: string;
  description: string;
  maxAttendees: number;
  hasExternalGuests: boolean;
  externalGuestsDesc: string | null;
  numExternalGuests: number | null;
  preferredLocation: string;
  safetyOfficerName: string;
  safetyOfficerZid: string;
  safetyOfficerPhone: string;
  roomRequirements: string;
}

export function RoomBookingForm({ societySlug, initial }: { societySlug: string; initial?: RoomBookingInitial }) {
  const router = useRouter();
  const editing = !!initial;
  const [loading, setLoading] = useState(false);
  const [hasExternal, setHasExternal] = useState(initial?.hasExternalGuests ?? false);
  const [location, setLocation] = useState(initial?.preferredLocation ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const body = {
      eventName: form.get("eventName"),
      preferredDate: form.get("preferredDate"),
      startTime: form.get("startTime"),
      endTime: form.get("endTime"),
      description: form.get("description"),
      maxAttendees: Number(form.get("maxAttendees")),
      hasExternalGuests: hasExternal,
      externalGuestsDesc: hasExternal ? form.get("externalGuestsDesc") : null,
      numExternalGuests: hasExternal ? Number(form.get("numExternalGuests")) : null,
      preferredLocation: location,
      safetyOfficerName: form.get("safetyOfficerName"),
      safetyOfficerZid: form.get("safetyOfficerZid"),
      safetyOfficerPhone: form.get("safetyOfficerPhone"),
      roomRequirements: form.get("roomRequirements"),
    };

    const res = await fetch(
      editing
        ? `/api/societies/${societySlug}/room-bookings/${initial!.id}`
        : `/api/societies/${societySlug}/room-bookings`,
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      toast.success(editing ? "Changes saved!" : "Room booking submitted!");
      router.push(`/${societySlug}/requests/room-booking/${editing ? initial!.id : data.id}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to save booking");
    }
  }

  const backHref = editing
    ? `/${societySlug}/requests/room-booking/${initial!.id}`
    : `/${societySlug}/requests/room-booking`;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{editing ? "Edit Room Booking" : "Room Booking Request"}</h1>
          <p className="text-sm text-muted-foreground">Submit an Arc room or resource booking</p>
        </div>
      </div>

      <div data-tour="room-notice" className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
        <strong>Note:</strong> Arc requires every room booking to be submitted at least 7 business days before
        the event, external guests or not.
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Event Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eventName">Event Name *</Label>
              <Input
                id="eventName"
                name="eventName"
                placeholder="e.g. SecSoc Weekly Workshop"
                defaultValue={initial?.eventName}
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preferredDate">Preferred Date *</Label>
                <Input
                  id="preferredDate"
                  name="preferredDate"
                  type="date"
                  defaultValue={initial ? format(new Date(initial.preferredDate), "yyyy-MM-dd") : undefined}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time *</Label>
                <TimeSelect id="startTime" name="startTime" defaultValue={initial?.startTime} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">End Time *</Label>
                <TimeSelect id="endTime" name="endTime" defaultValue={initial?.endTime} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Event Description *</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Describe the event..."
                rows={3}
                defaultValue={initial?.description}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxAttendees">Maximum Attendees *</Label>
              <Input
                id="maxAttendees"
                name="maxAttendees"
                type="number"
                min={1}
                placeholder="50"
                defaultValue={initial?.maxAttendees}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* External Guests */}
        <Card data-tour="room-external">
          <CardHeader>
            <CardTitle className="text-base">External Organisations / Persons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Does your event involve non-UNSW organisations or persons? *</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="hasExternal"
                    value="no"
                    defaultChecked={!hasExternal}
                    onChange={() => setHasExternal(false)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">No</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="hasExternal"
                    value="yes"
                    defaultChecked={hasExternal}
                    onChange={() => setHasExternal(true)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Yes</span>
                </label>
              </div>
            </div>
            {hasExternal && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="externalGuestsDesc">External Guests Description *</Label>
                  <Textarea
                    id="externalGuestsDesc"
                    name="externalGuestsDesc"
                    placeholder="Who are they? Their involvement? Do they represent a company? Is payment required?"
                    rows={3}
                    defaultValue={initial?.externalGuestsDesc ?? undefined}
                    required={hasExternal}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numExternalGuests">Number of External Guests *</Label>
                  <Input
                    id="numExternalGuests"
                    name="numExternalGuests"
                    type="number"
                    min={1}
                    defaultValue={initial?.numExternalGuests ?? undefined}
                    required={hasExternal}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Location Preference</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Preferred Location *</Label>
              <Select value={location} onValueChange={setLocation} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a location" />
                </SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Safety Officer */}
        <Card data-tour="room-safety">
          <CardHeader>
            <CardTitle className="text-base">Event Safety Officer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="safetyOfficerName">Full Name *</Label>
                <Input
                  id="safetyOfficerName"
                  name="safetyOfficerName"
                  placeholder="Jane Smith"
                  defaultValue={initial?.safetyOfficerName}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="safetyOfficerZid">zID *</Label>
                <Input
                  id="safetyOfficerZid"
                  name="safetyOfficerZid"
                  placeholder="z1234567"
                  defaultValue={initial?.safetyOfficerZid}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="safetyOfficerPhone">Phone Number *</Label>
              <Input
                id="safetyOfficerPhone"
                name="safetyOfficerPhone"
                type="tel"
                placeholder="0400 000 000"
                defaultValue={initial?.safetyOfficerPhone}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Room Requirements */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Room Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="roomRequirements"
              placeholder="Building preferences, room preferences, upper/middle/lower campus, AV requirements, accessibility requirements..."
              rows={4}
              defaultValue={initial?.roomRequirements}
              required
            />
          </CardContent>
        </Card>

        <div data-tour="room-submit" className="flex gap-3">
          <Button type="submit" disabled={loading || !location}>
            {loading ? "Saving…" : editing ? "Save Changes" : "Submit Booking Request"}
          </Button>
          <Button asChild variant="ghost">
            <Link href={backHref}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
