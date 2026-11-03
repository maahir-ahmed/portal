// How close an event's content deadline is. The events list colours each card by this,
// and the reminder job (src/lib/reminders.ts) pings Discord when it gets more urgent,
// so both read the same stages from here and can't drift apart.
//
// A deadline is naive wall-clock time stored as UTC (see formatDateTime in utils.ts):
// "5 PM on the 10th" is stored as 17:00Z whatever the society's timezone. So "now" has
// to be the society's wall clock in the same form, or every stage would change 10 to 11
// hours early in Sydney.

export type Stage = "plenty" | "soon" | "week" | "imminent" | "overdue";

/** Least to most urgent. A reminder goes out only when a request moves up this list. */
export const STAGES: Stage[] = ["plenty", "soon", "week", "imminent", "overdue"];

export const STAGE_CLASSES: Record<Stage, string> = {
  overdue: "border-l-red-600 border-red-200 bg-red-100",
  imminent: "border-l-red-500 border-red-200 bg-red-50",
  week: "border-l-amber-500 border-amber-200 bg-amber-50",
  soon: "border-l-yellow-400 border-yellow-200 bg-yellow-50",
  plenty: "border-l-emerald-500 border-emerald-200 bg-emerald-50",
};

const wallFormats = new Map<string, Intl.DateTimeFormat>();

/** The society's wall clock right now, as a naive-UTC timestamp like a stored deadline. */
export function wallClockNow(timeZone: string, now = new Date()): number {
  let f = wallFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    wallFormats.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

const DAY = 86_400_000;

/**
 * How urgent a deadline is now: a stage, and the label the events list shows. Days are
 * calendar days on the society's clock, so content due at 5 PM is "Due today" all day,
 * and anything past its deadline is overdue.
 */
export function urgency(deadline: Date, timeZone: string, now = new Date()): { stage: Stage; label: string } {
  const wall = wallClockNow(timeZone, now);
  const days = Math.floor(deadline.getTime() / DAY) - Math.floor(wall / DAY);
  if (deadline.getTime() < wall) return { stage: "overdue", label: days < 0 ? `${-days}d overdue` : "Overdue" };
  return {
    stage: days <= 2 ? "imminent" : days <= 6 ? "week" : days <= 14 ? "soon" : "plenty",
    label: days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days}d`,
  };
}
