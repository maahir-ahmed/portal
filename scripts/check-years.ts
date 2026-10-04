// Guards the year rules in src/lib/years.ts: which financial, AHEGS and events year a
// date lands in, at both edges of each range, with set dates and with the defaults.
import assert from "node:assert/strict";
import {
  ahegsYearOf,
  ahegsYearRange,
  eventYearRange,
  financialYearOf,
  financialYearRange,
  yearOptions,
  type YearDates,
} from "../src/lib/years";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const rows: YearDates[] = [
  { year: 2025, agmDate: d("2025-10-20"), term3End: d("2025-11-28") },
  { year: 2026, agmDate: d("2026-10-12"), term3End: d("2026-12-04") },
];

// Financial year: the Oct 2025 AGM opens 2026, which runs to the Oct 2026 AGM.
assert.equal(financialYearOf(rows, d("2025-10-19")), 2025);
assert.equal(financialYearOf(rows, d("2025-10-20")), 2026, "AGM day opens the new year");
assert.equal(financialYearOf(rows, d("2026-03-01")), 2026);
assert.equal(financialYearOf(rows, d("2026-10-11")), 2026);
assert.equal(financialYearOf(rows, d("2026-10-12")), 2027);
assert.deepEqual(financialYearRange(rows, 2026), { start: d("2025-10-20"), end: d("2026-10-12") });
// A year with no AGM set falls back to mid-October.
assert.equal(financialYearOf(rows, d("2027-10-14")), 2027);
assert.equal(financialYearOf(rows, d("2027-10-15")), 2028);

// AHEGS: end of Term 3 last year to end of Term 3 this year, both end days inclusive.
assert.equal(ahegsYearOf(rows, d("2025-11-28")), 2025, "Term 3's last day still counts");
assert.equal(ahegsYearOf(rows, d("2025-11-29")), 2026);
assert.equal(ahegsYearOf(rows, d("2026-12-04")), 2026);
assert.equal(ahegsYearOf(rows, d("2026-12-05")), 2027);
assert.deepEqual(ahegsYearRange(rows, 2026), { start: d("2025-11-29"), end: d("2026-12-05") });
// Every date lands in exactly the year whose range holds it.
for (let t = d("2024-01-01").getTime(); t < d("2028-01-01").getTime(); t += 86_400_000) {
  const date = new Date(t);
  const fy = financialYearRange(rows, financialYearOf(rows, date));
  assert.ok(date >= fy.start && date < fy.end, `financial ${date.toISOString()}`);
  const ay = ahegsYearRange(rows, ahegsYearOf(rows, date));
  assert.ok(date >= ay.start && date < ay.end, `ahegs ${date.toISOString()}`);
}

// Events go by calendar year.
assert.deepEqual(eventYearRange(2026), { start: d("2026-01-01"), end: d("2027-01-01") });

// Nothing before 2025: the first year reaches back to cover earlier dates, and
// pickers never offer 2024.
assert.equal(financialYearOf(rows, d("2024-03-01")), 2025);
assert.equal(ahegsYearOf(rows, d("2024-12-25")), 2025);
assert.equal(financialYearRange(rows, 2025).start.getTime(), 0);
assert.deepEqual(yearOptions(2024, 2026), [2026, 2025]);
assert.deepEqual(yearOptions(null, 2026), [2026]);

console.log("✅ years: financial (AGM to AGM), AHEGS (Term 3 end to Term 3 end) and events (calendar) bucket every day of 2024-2027 into exactly one year, none before 2025");
