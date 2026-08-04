"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import Link from "next/link";

const LOCATIONS = [
  { value: "LECTURE_THEATRE", label: "Lecture Theatre" },
  { value: "CATS_ROOM", label: "CATS Room" },
  { value: "SECLAB", label: "SecLab" },
  { value: "ROUNDHOUSE", label: "Roundhouse" },
  { value: "OUTDOOR_SPACE", label: "Outdoor Space" },
  { value: "OTHER", label: "Other" },
];

export default function NewRoomBookingPage() {
  const router = useRouter();
  const params = useParams<{ society: string }>();
  const [loading, setLoading] = useState(false);
  const [hasExternal, setHasExternal] = useState(false);
  const [location, setLocation] = useState("");

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

    const res = await fetch(`/api/societies/${params.society}/room-bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      toast.success("Room booking submitted!");
      router.push(`/${params.society}/requests/room-booking/${data.id}`);
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to submit booking");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/${params.society}/requests/room-booking`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Room Booking Request</h1>
          <p className="text-sm text-muted-foreground">Submit an Arc room or resource booking</p>
        </div>
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
        <strong>Note:</strong> Arc requires room booking submissions at least 7 business days before the event
        when external guests are involved.
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
              <Input id="eventName" name="eventName" placeholder="e.g. SecSoc Weekly Workshop" required />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preferredDate">Preferred Date *</Label>
                <Input id="preferredDate" name="preferredDate" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time *</Label>
                <Input id="startTime" name="startTime" type="time" step={900} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">End Time *</Label>
                <Input id="endTime" name="endTime" type="time" step={900} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Event Description *</Label>
              <Textarea id="description" name="description" placeholder="Describe the event..." rows={3} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxAttendees">Maximum Attendees *</Label>
              <Input id="maxAttendees" name="maxAttendees" type="number" min={1} placeholder="50" required />
            </div>
          </CardContent>
        </Card>

        {/* External Guests */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">External Organisations / Persons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Does your event involve non-UNSW organisations or persons? *</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="hasExternal" value="no" defaultChecked onChange={() => setHasExternal(false)} className="h-4 w-4" />
                  <span className="text-sm">No</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="hasExternal" value="yes" onChange={() => setHasExternal(true)} className="h-4 w-4" />
                  <span className="text-sm">Yes</span>
                </label>
              </div>
            </div>
            {hasExternal && (
              <>
                <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-orange-800">
                    Events with external guests require Arc submission at least 7 business days prior.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="externalGuestsDesc">External Guests Description *</Label>
                  <Textarea
                    id="externalGuestsDesc"
                    name="externalGuestsDesc"
                    placeholder="Who are they? Their involvement? Do they represent a company? Is payment required?"
                    rows={3}
                    required={hasExternal}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numExternalGuests">Number of External Guests *</Label>
                  <Input id="numExternalGuests" name="numExternalGuests" type="number" min={1} required={hasExternal} />
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event Safety Officer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="safetyOfficerName">Full Name *</Label>
                <Input id="safetyOfficerName" name="safetyOfficerName" placeholder="Jane Smith" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="safetyOfficerZid">zID *</Label>
                <Input id="safetyOfficerZid" name="safetyOfficerZid" placeholder="z1234567" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="safetyOfficerPhone">Phone Number *</Label>
              <Input id="safetyOfficerPhone" name="safetyOfficerPhone" type="tel" placeholder="0400 000 000" required />
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
              required
            />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading || !location}>
            {loading ? "Submitting…" : "Submit Booking Request"}
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/${params.society}/requests/room-booking`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
