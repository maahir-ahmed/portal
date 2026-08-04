import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { RubricShell } from "@/components/rubric/RubricShell";
import { RubricCopyPanel, type CopyRecord, type GrantRecord } from "@/components/rubric/RubricCopyPanel";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

// Rubric's site allows framing (no X-Frame-Options / CSP frame-ancestors), so it
// embeds here. We can't auto-fill its forms (they're a different origin — the browser
// blocks touching a cross-origin frame's DOM), so instead we show the room-booking /
// printing details alongside it to copy-paste in.
const RUBRIC_URL = "https://portal.hellorubric.com/";

const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const SIDED: Record<string, string> = {
  SINGLE: "Single-sided",
  DOUBLE_SHORT: "Double-sided (short edge)",
  DOUBLE_LONG: "Double-sided (long edge)",
};
const COLOUR: Record<string, string> = { BW: "Black & white", COLOUR: "Colour" };

export default async function RubricWebPage({
  params,
  searchParams,
}: {
  params: Promise<{ society: string }>;
  searchParams: Promise<{ type?: string; id?: string }>;
}) {
  const { society } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: society }, isActive: true },
  });
  // Execs only — this tab isn't shown to anyone else, and the guard blocks direct access.
  if (!membership || membership.role !== "EXECUTIVE") notFound();

  const societyId = membership.societyId;
  const [rooms, prints, grantEvents] = await Promise.all([
    prisma.roomBooking.findMany({
      where: { societyId },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { submittedBy: { select: { name: true } } },
    }),
    prisma.printingRequest.findMany({
      // Only jobs waiting to be submitted on the portal; once marked submitted
      // they drop off this list (but stay in the exec queue until pickup-ready).
      where: { societyId, status: "PENDING_ARC_SUBMISSION" },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { submittedBy: { select: { name: true } } },
    }),
    prisma.contentRequest.findMany({
      // Events with a Rubric event attached — the pool activity grants are submitted for.
      where: {
        societyId,
        OR: [{ rubricEventId: { not: null } }, { rubricEventLink: { not: null } }],
        status: { not: "CANCELLED" },
      },
      orderBy: { startDate: "desc" },
      take: 25,
      include: { submittedBy: { select: { name: true } } },
    }),
  ]);

  const bookings: CopyRecord[] = rooms.map((b) => ({
    id: b.id,
    title: `${b.eventName} · ${formatDate(b.preferredDate)}`,
    fields: [
      { label: "Event name", value: b.eventName },
      { label: "Date", value: formatDate(b.preferredDate) },
      { label: "Start time", value: b.startTime },
      { label: "End time", value: b.endTime },
      { label: "Location", value: pretty(b.preferredLocation) },
      { label: "Max attendees", value: String(b.maxAttendees) },
      { label: "Description", value: b.description },
      { label: "Room requirements", value: b.roomRequirements },
      { label: "External guests", value: b.hasExternalGuests ? `Yes${b.numExternalGuests ? ` (${b.numExternalGuests})` : ""}` : "No" },
      ...(b.hasExternalGuests && b.externalGuestsDesc ? [{ label: "External guests detail", value: b.externalGuestsDesc }] : []),
      { label: "Safety officer", value: b.safetyOfficerName },
      { label: "Safety officer zID", value: b.safetyOfficerZid },
      { label: "Safety officer phone", value: b.safetyOfficerPhone },
      { label: "Submitted by", value: b.submittedBy.name },
    ],
  }));

  const printing: CopyRecord[] = prints.map((p) => ({
    id: p.id,
    title: `${p.contactName} · ${formatDate(p.pickupAt)}`,
    fields: [
      { label: "Club name", value: p.clubName },
      { label: "Contact name", value: p.contactName },
      { label: "Contact email", value: p.contactEmail },
      { label: "Contact phone", value: p.contactPhone },
      { label: "Pickup", value: formatDateTime(p.pickupAt) },
      { label: "Quantity", value: String(p.quantity) },
      { label: "Pages (per doc)", value: String(p.pages) },
      { label: "Paper size", value: p.paperSize },
      { label: "Sided", value: SIDED[p.sided] ?? p.sided },
      { label: "Colour", value: COLOUR[p.colour] ?? p.colour },
      { label: "Cost", value: `$${Number(p.cost).toFixed(2)}` },
      ...(p.additionalDetails ? [{ label: "Additional details", value: p.additionalDetails }] : []),
      { label: "File", value: p.fileName },
      { label: "Submitted by", value: p.submittedBy.name },
    ],
  }));

  const grants: GrantRecord[] = grantEvents.map((e) => ({
    id: e.id,
    title: `${e.eventName} · ${formatDate(e.startDate)}`,
    status: e.activityGrantStatus,
    attendanceHref: e.rubricEventId ? `/${society}/rubric/events/${e.rubricEventId}` : undefined,
    fields: [
      { label: "Event name", value: e.eventName },
      { label: "Start date", value: formatDate(e.startDate) },
      ...(e.endDate ? [{ label: "End date", value: formatDate(e.endDate) }] : []),
      { label: "Location", value: e.location },
      { label: "Description / key points", value: e.keyPoints },
      ...(e.finishedBlurb ? [{ label: "Event blurb", value: e.finishedBlurb }] : []),
      ...(e.rubricEventLink ? [{ label: "Rubric event link", value: e.rubricEventLink }] : []),
      { label: "Submitted by", value: e.submittedBy.name },
    ],
  }));

  return (
    <RubricShell>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Fill Rubric&apos;s forms using the details panel — click any field to copy it, then paste into the form.
          </p>
          <a
            href={RUBRIC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Open in new tab <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="flex flex-col gap-3 lg:h-[calc(100vh-15rem)] lg:flex-row">
          <iframe
            src={RUBRIC_URL}
            title="Rubric portal"
            className="h-[70vh] w-full rounded-lg border bg-white lg:h-full lg:flex-1"
          />
          <RubricCopyPanel
            societySlug={society}
            bookings={bookings}
            printing={printing}
            grants={grants}
            initialTab={sp.type === "printing" ? "printing" : sp.type === "grants" ? "grants" : "room"}
            initialId={sp.id}
          />
        </div>
      </div>
    </RubricShell>
  );
}
