// Guards the guided tour against the one way it silently rots: a `data-tour`
// attribute being renamed or deleted while a step still points at it.
//   npx tsx scripts/check-tutorial.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { TOUR_STEPS, TOOLTIP_W, normalisePage, stepsFor, stepsForPage, tooltipBox } from "../src/lib/tutorial";

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

// The hovering box must always land on screen. A full-height target (the sidebar)
// has room neither above nor below, which is how it went off-screen once.
const VW = 1440;
const VH = 900;
const rect = (top: number, left: number, right: number, bottom: number) => ({ top, left, right, bottom });
const cases: [string, ReturnType<typeof rect> | null][] = [
  ["no target", null],
  ["sidebar (full height, left)", rect(0, 0, 256, VH)],
  ["bell (top right)", rect(20, VW - 60, VW - 20, 56)],
  ["card near the bottom", rect(VH - 120, 400, 900, VH - 40)],
  ["full-height panel on the right", rect(0, VW - 320, VW, VH)],
  ["target filling the viewport", rect(0, 0, VW, VH)],
];
for (const [label, r] of cases) {
  const box = tooltipBox(r, VW, VH);
  const centred = box.transform === "translate(-50%,-50%)";
  const left = typeof box.left === "number" ? box.left : NaN;
  assert.ok(centred || (left >= 0 && left + TOOLTIP_W <= VW), `${label}: box off-screen horizontally (left ${box.left})`);
  const topOk = box.top === "50%" || (typeof box.top === "number" && box.top >= 0 && box.top < VH);
  const bottomOk = typeof box.bottom === "number" && box.bottom >= 0 && box.bottom < VH;
  assert.ok(topOk || bottomOk, `${label}: box off-screen vertically (top ${box.top}, bottom ${box.bottom})`);
}

// Per-page help: every page the app has should have something to say, and every
// step should belong to exactly one page.
assert.equal(normalisePage("/secsoc/requests/treasury/cmrbf28n6001s01nwdiprcdzz", "secsoc"), "/requests/treasury/[id]");
assert.equal(normalisePage("/requests/room-booking/new"), "/requests/room-booking/new");
assert.equal(normalisePage("/secsoc/dashboard", "secsoc"), "/dashboard");

const PAGES = [
  "/dashboard",
  "/requests/content", "/requests/content/new", "/requests/content/[id]",
  "/requests/room-booking", "/requests/room-booking/new", "/requests/room-booking/[id]",
  "/requests/treasury", "/requests/treasury/new", "/requests/treasury/[id]",
  "/requests/printing", "/requests/printing/new", "/requests/printing/[id]",
  "/budget", "/executive/queue", "/members",
  "/rubric", "/rubric/events", "/rubric/members", "/rubric/grants", "/rubric/web",
  "/settings", "/account",
];
const emptyPages = PAGES.filter((page) => stepsForPage("EXECUTIVE", page).length === 0);
assert.deepEqual(emptyPages, [], `pages with no help steps:\n  ${emptyPages.join("\n  ")}`);

const pagedTotal = PAGES.reduce((sum, page) => sum + stepsForPage("EXECUTIVE", page).length, 0);
const tourable = TOUR_STEPS.filter((s) => !s.kind).length;
assert.equal(pagedTotal, tourable, `${tourable - pagedTotal} step(s) sit on a page not listed in PAGES`);

console.log(
  `✅ ${TOUR_STEPS.length} tour steps, ${anchors.size} anchors, ${cases.length} placement cases | ` +
    `exec ${stepsFor("EXECUTIVE").length}, director ${stepsFor("DIRECTOR").length}, subcom ${stepsFor("SUBCOMMITTEE").length}`
);
