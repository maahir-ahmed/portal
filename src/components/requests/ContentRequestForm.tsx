"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeField } from "@/components/ui/datetime";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export interface ContentRequestInitial {
  id: string;
  eventName: string;
  startDate: string;
  endDate: string | null;
  location: string;
  keyPoints: string;
  deadline: string;
  bannerRequired: boolean;
  blurbRequired: boolean;
  rubricRequired: boolean;
  otherNotes: string | null;
}

// Stored instant -> value for <input type="datetime-local">. Dates are treated as
// naive wall-clock (stored/displayed as-is in UTC), so slice the UTC ISO here.
// Formatting in the viewer's local timezone shifted the value by their offset on
// every edit round-trip.
const dtLocal = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 16) : "");

export function ContentRequestForm({ societySlug, initial }: { societySlug: string; initial?: ContentRequestInitial }) {
  const router = useRouter();
  const editing = !!initial;
  const [loading, setLoading] = useState(false);
  const [rubricRequired, setRubricRequired] = useState(initial?.rubricRequired ?? false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    // Pass the submitter so the clicked button's action (submit vs draft) is
    // captured — FormData(form) alone omits it, which defaulted everything to DRAFT.
    const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);

    const body = {
      eventName: form.get("eventName"),
      startDate: form.get("startDate"),
      endDate: form.get("endDate") || null,
      location: form.get("location"),
      keyPoints: form.get("keyPoints"),
      deadline: form.get("deadline"),
      bannerRequired: form.get("bannerRequired") === "true",
      blurbRequired: form.get("blurbRequired") === "true",
      rubricRequired: form.get("rubricRequired") === "true",
      otherNotes: form.get("otherNotes") || null,
      ...(editing ? {} : { status: form.get("action") === "submit" ? "SUBMITTED" : "DRAFT" }),
    };

    const url = editing
      ? `/api/societies/${societySlug}/content-requests/${initial!.id}`
      : `/api/societies/${societySlug}/content-requests`;

    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      toast.success(editing ? "Changes saved!" : "Content request created!");
      router.push(`/${societySlug}/requests/content/${editing ? initial!.id : data.id}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to save request");
    }
  }

  const backHref = editing ? `/${societySlug}/requests/content/${initial!.id}` : `/${societySlug}/requests/content`;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{editing ? "Edit Content Request" : "New Content Request"}</h1>
          <p className="text-sm text-muted-foreground">{editing ? "Update the details of this request" : "Submit a marketing or content request"}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eventName">Event Name *</Label>
              <Input id="eventName" name="eventName" placeholder="e.g. SecSoc Capture the Flag 2025" defaultValue={initial?.eventName} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date & Time *</Label>
                <DateTimeField id="startDate" name="startDate" defaultValue={dtLocal(initial?.startDate)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date & Time</Label>
                <DateTimeField id="endDate" name="endDate" defaultValue={dtLocal(initial?.endDate)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Input id="location" name="location" placeholder="e.g. CATS Room, UNSW" defaultValue={initial?.location} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="keyPoints">Key Points *</Label>
              <Textarea
                id="keyPoints"
                name="keyPoints"
                placeholder="Bullet points about the event (who, what, why, prizes, etc.)"
                rows={4}
                defaultValue={initial?.keyPoints}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadline">Content Deadline *</Label>
              <DateTimeField id="deadline" name="deadline" defaultValue={dtLocal(initial?.deadline)} required />
              <p className="text-xs text-muted-foreground">When do you need the content ready by?</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content Required</CardTitle>
            <CardDescription>Select all types of content you need</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {([
              { name: "bannerRequired", label: "Banner / Graphic", desc: "Social media banner or event graphic", checked: initial?.bannerRequired },
              { name: "blurbRequired", label: "Event Blurb", desc: "Written description for the event", checked: initial?.blurbRequired },
              { name: "rubricRequired", label: "Rubric Event", desc: "Requires executive to create a Rubric event + QR code", checked: initial?.rubricRequired },
            ] as const).map(({ name, label, desc, checked }) => (
              <label key={name} className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  name={name}
                  value="true"
                  defaultChecked={checked ?? false}
                  onChange={name === "rubricRequired" ? (e) => setRubricRequired(e.target.checked) : undefined}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </label>
            ))}

            {rubricRequired && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
                <strong>Note:</strong> Selecting Rubric Event means an executive will need to create the Rubric event, attach the link, and generate a QR code.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="otherNotes"
              placeholder="Any other information, special requirements, or context..."
              rows={3}
              defaultValue={initial?.otherNotes ?? ""}
            />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          {editing ? (
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save Changes"}
            </Button>
          ) : (
            <>
              <Button type="submit" name="action" value="submit" disabled={loading}>
                {loading ? "Submitting…" : "Submit Request"}
              </Button>
              <Button type="submit" name="action" value="draft" variant="outline" disabled={loading}>
                Save as Draft
              </Button>
            </>
          )}
          <Button asChild variant="ghost">
            <Link href={backHref}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
