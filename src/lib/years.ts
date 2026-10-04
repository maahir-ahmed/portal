// Which year a record belongs to. Nothing is stamped with a year: each record keeps its
// own date and is bucketed here at read time, against the two dates per year an exec
// sets in Settings (SocietyYear). Three different years run side by side:
//
//   events     calendar year of the event
//   financial  AGM to AGM. The AGM is in Term 3, and the year it opens is named after
//              the following year: the Oct 2025 AGM opens "2026" (treasury, budget)
//   AHEGS      day after Term 3 ends in N-1, through the day Term 3 ends in N
//
// All dates are compared in UTC, the same naive wall-clock convention as every other
// typed-in date in the app (see formatDate in utils.ts).

export interface YearDates {
  year: number;
  agmDate: Date | null;
  term3End: Date | null;
}

const DAY = 86_400_000;

// The site keeps records from 2025 onwards. The first year has no earlier boundary to
// set (its AGM and Term 3 end would be 2024's), so it reaches back to cover anything
// before it instead of leaving a 2024 year behind.
export const FIRST_YEAR = 2025;
const BEGINNING = new Date(0);
const utc = (y: number, month: number, day: number) => new Date(Date.UTC(y, month, day));

// Used until an exec sets the real date. Mid-October sits inside Term 3, where AGMs are
// held, and Term 3 ends around the end of November.
const DEFAULT_AGM = (y: number) => utc(y, 9, 15);
const DEFAULT_TERM3_END = (y: number) => utc(y, 10, 30);

export function agmDate(rows: YearDates[], year: number): Date {
  return rows.find((r) => r.year === year)?.agmDate ?? DEFAULT_AGM(year);
}

export function term3End(rows: YearDates[], year: number): Date {
  return rows.find((r) => r.year === year)?.term3End ?? DEFAULT_TERM3_END(year);
}

/** [start, end) of financial year `year`: from the previous year's AGM to this year's. */
export function financialYearRange(rows: YearDates[], year: number) {
  return { start: year <= FIRST_YEAR ? BEGINNING : agmDate(rows, year - 1), end: agmDate(rows, year) };
}

export function financialYearOf(rows: YearDates[], date: Date): number {
  const y = date.getUTCFullYear();
  return Math.max(FIRST_YEAR, date.getTime() >= agmDate(rows, y).getTime() ? y + 1 : y);
}

/** [start, end) of AHEGS year `year`. The Term 3 end date itself counts in `year`. */
export function ahegsYearRange(rows: YearDates[], year: number) {
  return {
    start: year <= FIRST_YEAR ? BEGINNING : new Date(term3End(rows, year - 1).getTime() + DAY),
    end: new Date(term3End(rows, year).getTime() + DAY),
  };
}

export function ahegsYearOf(rows: YearDates[], date: Date): number {
  const y = date.getUTCFullYear();
  return Math.max(FIRST_YEAR, date.getTime() >= term3End(rows, y).getTime() + DAY ? y + 1 : y);
}

/** [start, end) of an events year, which is just the calendar year. */
export function eventYearRange(year: number) {
  return { start: utc(year, 0, 1), end: utc(year + 1, 0, 1) };
}

/** Years to offer in a picker: every year from the first with data to `latest`, newest first. */
export function yearOptions(first: number | null, latest: number): number[] {
  const from = Math.max(FIRST_YEAR, Math.min(first ?? latest, latest));
  return Array.from({ length: latest - from + 1 }, (_, i) => latest - i);
}

/** A `?year=` value, or null when it is missing or not a plausible year. */
export function parseYear(v: string | undefined | null): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= FIRST_YEAR && n <= 2100 ? n : null;
}
