import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, differenceInBusinessDays, isSameDay } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return format(new Date(date), "d MMM yyyy");
}

export function formatDateTime(date: Date | string) {
  return format(new Date(date), "d MMM yyyy, h:mm a");
}

export function formatTime(date: Date | string) {
  return format(new Date(date), "h:mm a");
}

// "6:00 PM – 9:00 PM", or "6:00 PM – 5 Aug 2026, 1:00 AM" when the event spans days.
export function formatTimeRange(start: Date | string, end?: Date | string | null) {
  const s = new Date(start);
  if (!end) return formatTime(s);
  const e = new Date(end);
  return `${formatTime(s)} – ${isSameDay(s, e) ? formatTime(e) : formatDateTime(e)}`;
}

export function timeAgo(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function businessDaysUntil(date: Date | string): number {
  return differenceInBusinessDays(new Date(date), new Date());
}

// Statuses where the booking has already reached Arc (or is finished with). Past
// these, nothing is outstanding and a deadline warning is just noise.
const REACHED_ARC = ["SUBMITTED_TO_ARC", "APPROVED", "REJECTED", "COMPLETED"];

/**
 * Whether a booking is at risk of missing Arc's seven-business-day deadline.
 *
 * The warning is about getting it lodged in time, so it only fires while that is
 * still both possible and needed. `businessDaysUntil` goes negative once the event
 * has passed, which is why the lower bound is here: without it every historical
 * booking reads as late.
 */
export function isLateArcSubmission(eventDate: Date | string, status?: string): boolean {
  if (status && REACHED_ARC.includes(status)) return false;
  const days = businessDaysUntil(eventDate);
  return days >= 0 && days < 7;
}

export function formatCurrency(amount: number | string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Number(amount));
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    SUBMITTED: "bg-blue-100 text-blue-700",
    ASSIGNED: "bg-purple-100 text-purple-700",
    IN_PROGRESS: "bg-yellow-100 text-yellow-700",
    AWAITING_INFORMATION: "bg-orange-100 text-orange-700",
    COMPLETED: "bg-green-100 text-green-700",
    CANCELLED: "bg-gray-100 text-gray-500",
    UNDER_REVIEW: "bg-yellow-100 text-yellow-700",
    WAITING_ON_INFORMATION: "bg-orange-100 text-orange-700",
    SUBMITTED_TO_ARC: "bg-blue-100 text-blue-700",
    APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-700",
    REIMBURSEMENT_PENDING: "bg-blue-100 text-blue-700",
    REIMBURSED: "bg-green-100 text-green-700",
    PENDING_APPROVAL: "bg-amber-100 text-amber-700",
    PENDING_ARC_SUBMISSION: "bg-purple-100 text-purple-700",
    READY_FOR_PICKUP: "bg-green-100 text-green-700",
    NOT_SUBMITTED: "bg-gray-100 text-gray-600",
    PAID: "bg-emerald-100 text-emerald-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-700";
}

const STATUS_LABEL_OVERRIDES: Record<string, string> = {
  AWAITING_INFORMATION: "Need more information",
  PENDING_ARC_SUBMISSION: "Pending Arc Submission",
  READY_FOR_PICKUP: "Ready for Pickup",
};

export function statusLabel(status: string): string {
  if (STATUS_LABEL_OVERRIDES[status]) return STATUS_LABEL_OVERRIDES[status];
  return status
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// Arc's event categories, used by the room booking form and the exec detail view.
export const EVENT_TYPES = [
  { value: "SOCIAL_ACTIVITY", label: "Social - Activity" },
  { value: "SOCIAL_MEETUP", label: "Social - Meet-Up" },
  { value: "WORKSHOP", label: "Workshop" },
  { value: "INTERNAL_TRAINING", label: "Internal Training (contributing members)" },
  { value: "PRESENTATION_TALK_PANEL", label: "Presentation/Talk/Panel" },
  { value: "DANCE_PERFORMING_ARTS", label: "Dance/Performing Arts" },
  { value: "MENTORING", label: "Mentoring" },
  { value: "INTERNAL_MEETING", label: "Internal Meeting (contributing members)" },
  { value: "GENERAL_MEETING", label: "Annual/extraordinary General Meeting" },
  { value: "NETWORKING_INDUSTRY", label: "Networking/Industry Event" },
  { value: "MOVIE_NIGHT", label: "Movie Night/Show Screening" },
  { value: "PARTY_COCKTAIL", label: "Party/Cocktail Night" },
  { value: "OTHER", label: "Other" },
] as const;

export const EVENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.value, t.label])
);
