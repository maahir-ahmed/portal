// Guards the deadline stages in src/lib/urgency.ts that colour the events list and
// decide the Discord reminders: each boundary, and "now" read on the society's clock.
import assert from "node:assert/strict";
import { urgency, wallClockNow } from "../src/lib/urgency";

// 9:30 PM UTC on 9 Nov is 8:30 AM on 10 Nov in Sydney (daylight time, +11).
const now = new Date("2026-11-09T21:30:00Z");
assert.equal(wallClockNow("Australia/Sydney", now), Date.UTC(2026, 10, 10, 8, 30));
assert.equal(wallClockNow("UTC", now), now.getTime());

const at = (deadline: string, tz = "Australia/Sydney") => urgency(new Date(`${deadline}Z`), tz, now);

// Due 5 PM on 10 Nov, typed in Sydney: due today there. Comparing against the real UTC
// instant (the old way) made it tomorrow, and changed every colour 11 hours early.
assert.deepEqual(at("2026-11-10T17:00:00"), { stage: "imminent", label: "Due today" });
assert.deepEqual(at("2026-11-10T17:00:00", "UTC"), { stage: "imminent", label: "Due tomorrow" });

// Past the deadline is overdue, even later the same day.
assert.deepEqual(at("2026-11-10T08:00:00"), { stage: "overdue", label: "Overdue" });
assert.deepEqual(at("2026-11-08T17:00:00"), { stage: "overdue", label: "2d overdue" });

// Stage boundaries, in calendar days.
assert.deepEqual(at("2026-11-11T09:00:00"), { stage: "imminent", label: "Due tomorrow" });
assert.equal(at("2026-11-12T09:00:00").stage, "imminent"); // 2 days
assert.equal(at("2026-11-13T09:00:00").stage, "week"); // 3
assert.equal(at("2026-11-16T09:00:00").stage, "week"); // 6
assert.equal(at("2026-11-17T09:00:00").stage, "soon"); // 7
assert.equal(at("2026-11-24T09:00:00").stage, "soon"); // 14
assert.deepEqual(at("2026-11-25T09:00:00"), { stage: "plenty", label: "Due in 15d" });

console.log("urgency: all checks passed");
