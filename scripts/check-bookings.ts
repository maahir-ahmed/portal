// Guards the room-booking deadline warning. It shipped once firing on every past
// booking, because `businessDaysUntil` goes negative and "negative < 7" is true.
//   npx tsx scripts/check-bookings.ts
import assert from "node:assert/strict";
import { isLateArcSubmission } from "../src/lib/utils";

const days = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

// Inside the window and still to be lodged: the one case that should warn.
assert.equal(isLateArcSubmission(days(2)), true, "an event in 2 days is late");
assert.equal(isLateArcSubmission(days(2), "SUBMITTED"), true);
assert.equal(isLateArcSubmission(days(2), "UNDER_REVIEW"), true);
assert.equal(isLateArcSubmission(days(2), "WAITING_ON_INFORMATION"), true);

// Far enough out to make the deadline.
assert.equal(isLateArcSubmission(days(30)), false, "an event a month away is not late");

// The regression: a past event is not "late", it is over.
assert.equal(isLateArcSubmission(days(-1)), false, "yesterday's booking must not warn");
assert.equal(isLateArcSubmission(days(-90)), false, "last term's booking must not warn");
assert.equal(isLateArcSubmission(days(-3), "SUBMITTED"), false);

// Already with Arc, or finished: nothing is outstanding.
for (const status of ["SUBMITTED_TO_ARC", "APPROVED", "REJECTED", "COMPLETED"]) {
  assert.equal(isLateArcSubmission(days(2), status), false, `${status} must not warn`);
}

// The rule applies to every booking now, not only those with external guests, so
// there is no guest flag in the signature at all.
assert.equal(isLateArcSubmission.length, 2, "signature is (eventDate, status?)");

console.log("✅ bookings: seven-day warning fires only while a booking can still be lodged in time");
