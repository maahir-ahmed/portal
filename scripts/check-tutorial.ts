// Guards the guided tour against the one way it silently rots: a `data-tour`
// attribute being renamed or deleted while a step still points at it.
//   npx tsx scripts/check-tutorial.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { ROLE_RANK, TOUR_STEPS, TOOLTIP_W, normalisePage, stepsFor, stepsForPage, tooltipBox } from "../src/lib/tutorial";

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
  for (const suffix of ["dashboard", "content", "room", "treasury", "printing", "budget", "queue", "board", "members", "ahegs", "rubric", "settings", "account", "current", "comparison"]) {
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

// Phones. No width here fits the beside branches, so a target too tall to clear
// `room` above or below used to fall through to the centred box and sit on top of
// the very thing the step was pointing at. Every case below must land beside the
// target, not over it, and inside the gutters.
const PHONES: [number, number][] = [[320, 568], [360, 640], [390, 844], [430, 932]];
for (const [vw, vh] of PHONES) {
  const tall = Math.round(vh * 0.45); // beats `room` in both directions: the old bug
  const phoneCases: [string, ReturnType<typeof rect>][] = [
    ["card at the top", rect(80, 16, vw - 16, 200)],
    ["card mid-screen", rect(vh / 2 - 60, 16, vw - 16, vh / 2 + 60)],
    ["card near the bottom", rect(vh - 220, 16, vw - 16, vh - 90)],
    ["tall centred panel", rect((vh - tall) / 2, 16, vw - 16, (vh + tall) / 2)],
    ["edge-to-edge element", rect(120, 0, vw, 300)],
  ];
  for (const [label, r] of phoneCases) {
    const box = tooltipBox(r, vw, vh);
    const at = `${label} @ ${vw}×${vh}`;
    assert.notEqual(box.transform, "translate(-50%,-50%)", `${at}: fell back to the centred box, which covers the target`);
    assert.ok(typeof box.left === "number" && box.left >= 0, `${at}: box off the left edge (${box.left})`);
    assert.ok((box.left as number) + box.width <= vw, `${at}: box off the right edge (${box.left} + ${box.width} > ${vw})`);

    // Resolve to a real top/bottom span and prove it misses the highlighted rect.
    const cap = Number(String(box.maxHeight).replace("px", ""));
    assert.ok(Number.isFinite(cap) && cap >= 96, `${at}: maxHeight must be a usable pixel cap, got ${box.maxHeight}`);
    const top = typeof box.top === "number" ? box.top : vh - box.bottom! - cap;
    const bottom = top + cap;
    assert.ok(top >= 0 && bottom <= vh, `${at}: box spills off-screen vertically (${top}–${bottom} in ${vh})`);
    assert.ok(bottom <= r.top || top >= r.bottom, `${at}: box (${top}–${bottom}) overlaps the target (${r.top}–${r.bottom})`);
  }
}

// A target taller than the phone screen can't be missed, but the box must still dock
// to an edge rather than sit across the middle of what it is describing.
for (const [vw, vh] of PHONES) {
  const box = tooltipBox(rect(-200, 0, vw, vh + 200), vw, vh);
  assert.notEqual(box.transform, "translate(-50%,-50%)", `oversized target @ ${vw}×${vh}: centred instead of docking to an edge`);
  assert.equal(box.bottom, 12, `oversized target @ ${vw}×${vh}: should dock to the bottom edge`);
  assert.ok(Number(String(box.maxHeight).replace("px", "")) <= vh * 0.5, `oversized target @ ${vw}×${vh}: docked box takes over half the screen`);
}

// The box must never be wider than the screen it is on.
for (const [vw, vh] of [...PHONES, [VW, VH] as [number, number]]) {
  assert.ok(tooltipBox(null, vw, vh).width <= vw - 24, `centred box wider than the ${vw}px viewport`);
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
  "/budget", "/executive/queue", "/board", "/members", "/ahegs",
  "/rubric", "/rubric/events", "/rubric/members", "/rubric/grants", "/rubric/web",
  "/settings", "/account",
];
const emptyPages = PAGES.filter((page) => stepsForPage("EXECUTIVE", page).length === 0);
assert.deepEqual(emptyPages, [], `pages with no help steps:\n  ${emptyPages.join("\n  ")}`);

// The tour must never walk someone onto a page they'd be redirected off. These are
// the access floors enforced by the page guards and the sidebar; a step that outranks
// its page is a step whose role gate was forgotten.
const PAGE_MIN_ROLE = {
  "/executive/queue": "EXECUTIVE",
  "/board": "EXECUTIVE",
  "/members": "EXECUTIVE",
  "/settings": "EXECUTIVE",
  "/rubric/members": "EXECUTIVE",
  "/rubric/grants": "EXECUTIVE",
  "/rubric/web": "EXECUTIVE",
  "/ahegs": "DIRECTOR",
  "/rubric": "DIRECTOR",
  "/rubric/events": "DIRECTOR",
} as const;

for (const [page, minRole] of Object.entries(PAGE_MIN_ROLE)) {
  for (const role of ["EXECUTIVE", "DIRECTOR", "SUBCOMMITTEE"] as const) {
    if (ROLE_RANK[role] >= ROLE_RANK[minRole]) continue;
    const leaked = stepsForPage(role, page).map((s) => s.id);
    assert.deepEqual(leaked, [], `${role} tour covers ${page}, which needs ${minRole}: ${leaked.join(", ")}`);
  }
}

const pagedTotal = PAGES.reduce((sum, page) => sum + stepsForPage("EXECUTIVE", page).length, 0);
const tourable = TOUR_STEPS.filter((s) => !s.kind).length;
assert.equal(pagedTotal, tourable, `${tourable - pagedTotal} step(s) sit on a page not listed in PAGES`);

console.log(
  `✅ ${TOUR_STEPS.length} tour steps, ${anchors.size} anchors, ${cases.length} desktop + ${PHONES.length * 5} phone placement cases | ` +
    `exec ${stepsFor("EXECUTIVE").length}, director ${stepsFor("DIRECTOR").length}, subcom ${stepsFor("SUBCOMMITTEE").length}`
);
