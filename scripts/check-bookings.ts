// Guards the room-booking deadline warning. It shipped once firing on every past
// booking, because `businessDaysUntil` goes negative and "negative < 7" is true.
//   npx tsx scripts/check-bookings.ts
import assert from "node:assert/strict";
import { isLateArcSubmission } from "../src/lib/utils";

// Bookings store the typed date as UTC midnight; checked against a fixed Tuesday 9 AM
// in Sydney (still Monday in UTC).
const TZ = "Australia/Sydney";
const NOW = new Date("2026-11-02T22:00:00Z"); // Tue 3 Nov, 9 AM AEDT
const days = (n: number) => new Date(Date.UTC(2026, 10, 3 + n));
const late = (d: Date, status?: string) => isLateArcSubmission(d, status, TZ, NOW);

// Inside the window and still to be lodged: the one case that should warn.
assert.equal(late(days(2)), true, "an event in 2 days is late");
assert.equal(late(days(2), "SUBMITTED"), true);
assert.equal(late(days(2), "UNDER_REVIEW"), true);
assert.equal(late(days(2), "WAITING_ON_INFORMATION"), true);

// Far enough out to make the deadline.
assert.equal(late(days(30)), false, "an event a month away is not late");

// The regression: a past event is not "late", it is over.
assert.equal(late(days(-1)), false, "yesterday's booking must not warn");
assert.equal(late(days(-90)), false, "last term's booking must not warn");
assert.equal(late(days(-3), "SUBMITTED"), false);

// Already with Arc, or finished: nothing is outstanding.
for (const status of ["SUBMITTED_TO_ARC", "APPROVED", "REJECTED", "COMPLETED"]) {
  assert.equal(late(days(2), status), false, `${status} must not warn`);
}

// The rule applies to every booking now, not only those with external guests, so
// there is no guest flag in the signature at all.
assert.equal(isLateArcSubmission.length, 3, "signature is (eventDate, status, timeZone, now?)");

// Sydney's today, not the server's: Monday's event is over by Tuesday morning, though
// UTC is still on Monday.
assert.equal(late(days(-1)), false, "Monday's booking is past on Tuesday morning in Sydney");
assert.equal(late(days(0)), true, "today's booking still warns");
// Seven business days from Tuesday is next Thursday (12 Nov).
assert.equal(late(days(9)), false, "next Thursday is exactly seven business days out");
assert.equal(late(days(8)), true, "next Wednesday is six");

console.log("✅ bookings: seven-day warning fires only while a booking can still be lodged in time");
