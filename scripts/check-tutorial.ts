// Guards the guided tour against the one way it silently rots: a `data-tour`
// attribute being renamed or deleted while a step still points at it.
//   npx tsx scripts/check-tutorial.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { TOUR_STEPS, stepsFor } from "../src/lib/tutorial";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

const source = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
const anchors = new Set(
  [...source.matchAll(/data-tour=(?:"([^"]+)"|\{[^}]*?"([^"]+)"[^}]*?\})/g)].flatMap((m) =>
    [m[1], m[2]].filter(Boolean) as string[]
  )
);
// Template-literal anchors (`nav-${item.tour}` etc.) can't be read statically.
for (const m of source.matchAll(/data-tour=\{`([a-z-]+)-\$\{[^}]+\}`\}/g)) {
  for (const suffix of ["dashboard", "content", "room", "treasury", "printing", "budget", "queue", "members", "rubric", "settings", "account", "current", "comparison"]) {
    anchors.add(`${m[1]}-${suffix}`);
  }
}

const ids = TOUR_STEPS.map((s) => s.id);
assert.equal(new Set(ids).size, ids.length, "duplicate tour step ids");
assert.equal(TOUR_STEPS.filter((s) => s.kind === "welcome").length, 1, "need exactly one welcome step");
assert.equal(TOUR_STEPS.filter((s) => s.kind === "cleanup").length, 1, "need exactly one cleanup step");
assert.equal(TOUR_STEPS.at(0)?.kind, "welcome", "welcome must be first");
assert.equal(TOUR_STEPS.at(-1)?.kind, "cleanup", "cleanup must be last");

const missing = TOUR_STEPS.flatMap((s) =>
  [s.target, s.click].filter((t): t is string => !!t && !anchors.has(t)).map((t) => `${s.id} → ${t}`)
);
assert.deepEqual(missing, [], `steps point at data-tour anchors that no longer exist:\n  ${missing.join("\n  ")}`);

// Role filtering: a subcommittee member must still get a runnable tour.
for (const role of ["EXECUTIVE", "DIRECTOR", "SUBCOMMITTEE"]) {
  const steps = stepsFor(role);
  assert.ok(steps.length > 10, `${role} tour is suspiciously short (${steps.length})`);
  assert.equal(steps.at(0)?.kind, "welcome", `${role} tour must open on the welcome step`);
  assert.equal(steps.at(-1)?.kind, "cleanup", `${role} tour must end on the cleanup step`);
}

console.log(
  `✅ ${TOUR_STEPS.length} tour steps, ${anchors.size} anchors — ` +
    `exec ${stepsFor("EXECUTIVE").length}, director ${stepsFor("DIRECTOR").length}, subcom ${stepsFor("SUBCOMMITTEE").length}`
);
