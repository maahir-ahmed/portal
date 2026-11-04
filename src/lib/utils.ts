import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isSameDay } from "date-fns";
import { wallClockNow } from "./urgency";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return format(new Date(date), "d MMM yyyy");
}

export function formatDateTime(date: Date | string) {
  return format(new Date(date), "d MMM yyyy, h:mm a");
}

// Two kinds of date live in this app. Times people type in (event start, deadline,
// pickup) are naive wall-clock stored as UTC, so formatDate/formatDateTime/formatTime
// show them as-is in the server's UTC; see dtLocal in ContentRequestForm. Real moments
// (createdAt, submitted-to-Rubric) are true instants and must be shown in the society's
// own timezone (Society.timezone, set in Settings), or a claim made at 11:59 PM reads
// as 12:59 PM. That's this function.
const timestampFormats = new Map<string, Intl.DateTimeFormat>();

/** A real moment in the society's timezone, in the same "5 Oct 2026, 11:59 PM" shape as formatDateTime. */
export function formatTimestamp(date: Date | string, timeZone: string) {
  let f = timestampFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    timestampFormats.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

/** Every IANA timezone this runtime knows, for the Settings picker and its validation. */
export const TIMEZONES: readonly string[] = Intl.supportedValuesOf("timeZone");

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

// Arc's activity grant has to be claimed within 30 days of the event; past that the
// claim is dead. Shared by the exec queue's countdown and the web portal's grant list.
export const ACTIVITY_GRANT_DAYS = 30;

export function grantDeadline(eventStart: Date | string): Date {
  return new Date(new Date(eventStart).getTime() + ACTIVITY_GRANT_DAYS * 86_400_000);
}

export function timeAgo(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

const DAY = 86_400_000;

/**
 * Weekdays from `today` up to and including `date`, both naive dates (a typed-in date
 * stored as UTC midnight). Counted in UTC so the server's and a browser's own timezone
 * never shift the day.
 */
export function businessDaysUntil(date: Date | string, today: number): number {
  const from = Math.floor(today / DAY);
  const to = Math.floor(new Date(date).getTime() / DAY);
  let n = 0;
  for (let d = from + 1; d <= to; d++) {
    const wd = new Date(d * DAY).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

// Statuses where the booking has already reached Arc (or is finished with). Past
// these, nothing is outstanding and a deadline warning is just noise.
const REACHED_ARC = ["SUBMITTED_TO_ARC", "APPROVED", "REJECTED", "COMPLETED"];

/**
 * Who may open an event request or room booking: the people its list shows it to
 * (executives, directors, the submitter), plus whoever it's assigned to and marketing,
 * who do the content work. Bookings carry safety-officer phone numbers and zIDs.
 */
export function canViewRequest(
  m: { role: string; title: string | null },
  userId: string,
  r: { submittedById: string; assignedToId?: string | null }
): boolean {
  return (
    m.role === "EXECUTIVE" ||
    m.role === "DIRECTOR" ||
    r.submittedById === userId ||
    r.assignedToId === userId ||
    (m.title?.toLowerCase().includes("marketing") ?? false)
  );
}

/** Arc has approved or refused it: from here the submitter may only record the room. */
export const bookingDecided = (status: string) => ["APPROVED", "REJECTED", "COMPLETED"].includes(status);

/**
 * Whether a booking is at risk of missing Arc's seven-business-day deadline.
 *
 * The warning is about getting it lodged in time, so it only fires while that is
 * still both possible and needed. A past event is checked by calendar date, not
 * `businessDaysUntil`: that only goes negative a business day later, so viewed on
 * a weekend or Monday, Friday's event reads as 0 days away and would warn.
 */
export function isLateArcSubmission(eventDate: Date | string, status: string | undefined, timeZone: string, now = new Date()): boolean {
  if (status && REACHED_ARC.includes(status)) return false;
  // "Today" on the society's clock: the server runs in UTC, which is still yesterday
  // for Sydney until 10 or 11 in the morning.
  const today = Math.floor(wallClockNow(timeZone, now) / DAY) * DAY;
  if (new Date(eventDate).getTime() < today) return false;
  return businessDaysUntil(eventDate, today) < 7;
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
  PENDING_ARC_SUBMISSION: "Pending Arc submission",
  SUBMITTED_TO_ARC: "Submitted to Arc",
};

export function statusLabel(status: string): string {
  if (STATUS_LABEL_OVERRIDES[status]) return STATUS_LABEL_OVERRIDES[status];
  return status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase()); // sentence case: "Under review", not "Under Review"
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

// Only a path on this site: sign-in uses redirect:false and router.push, which skips
// NextAuth's own same-origin check, so /login?callbackUrl=https://evil would otherwise
// send someone straight off to a lookalike page after they sign in. The proxy and the
// setup page only ever set paths. "//x" and "/\\x" are other hosts to a browser.
export function safeCallback(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

/**
 * A typed-in date the app can store and lay out: it parses, and falls between 2000 and
 * 2100. Chrome's date input takes 5 and 6 digit years, and a claim dated 20255 made the
 * year pickers list every year up to it.
 */
export function isPlausibleDate(s: string): boolean {
  const t = Date.parse(s);
  if (Number.isNaN(t)) return false;
  const year = new Date(t).getUTCFullYear();
  return year >= 2000 && year <= 2100;
}
