// Guards the AHEGS export. Arc rejects lists that aren't on its own template, and a
// spreadsheet this app writes by hand fails in ways nobody notices until the
// submission bounces — so this fills each template and reads the result back.
//   npx tsx scripts/check-ahegs.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { fillTemplate, readZip } from "../src/lib/xlsx";
import { mergeMinutes } from "../src/lib/pdfMerge";
import {
  AHEGS_CATEGORIES,
  TEMPLATES,
  ahegsScope,
  canTouchPortfolio,
  hoursFromMeetings,
  resolveRow,
  rowProblems,
} from "../src/lib/ahegs";

const sheetOf = (buf: Buffer) => readZip(buf).get("xl/worksheets/sheet1.xml")!.toString("utf8");
const path = (file: string) => join("public", file);

// 1. The blank templates must stay blank. Overwriting one with a filled copy would
//    publish last year's committee: public/ is committed and served by the app.
for (const category of AHEGS_CATEGORIES) {
  const zip = readZip(readFileSync(path(TEMPLATES[category].file)));
  const strings = zip.get("xl/sharedStrings.xml")!.toString("utf8");
  const zids = [...strings.matchAll(/\b\d{7}\b/g)].map((m) => m[0]);
  assert.deepEqual(zids, [], `${TEMPLATES[category].file} carries zIDs: ${zids.join(", ")}`);
  assert.ok(
    !/@(unsw|ad\.unsw)\.edu\.au/.test(strings),
    `${TEMPLATES[category].file} carries student emails`
  );
  const dataRows = [...sheetOf(readFileSync(path(TEMPLATES[category].file))).matchAll(/<row r="(\d+)"/g)]
    .map((m) => Number(m[1]))
    .filter((r) => r > 2);
  for (const r of dataRows) {
    const row = new RegExp(`<row r="${r}"[^>]*>([\\s\\S]*?)</row>`).exec(
      sheetOf(readFileSync(path(TEMPLATES[category].file)))
    )![1];
    assert.ok(!row.includes("<v>"), `${TEMPLATES[category].file} row ${r} still holds data`);
  }
}

// 2. Filling a template keeps every part of the original workbook and rewrites only
//    the rows: drop the styles or the drawing and Arc gets a file that won't open.
const original = readZip(readFileSync(path(TEMPLATES.EXECUTIVE.file)));
const filled = fillTemplate(path(TEMPLATES.EXECUTIVE.file), [
  ["Ada Lovelace", 5123456, "z5123456@unsw.edu.au", "President", new Date("2026-01-01T00:00:00Z"), new Date("2026-12-31T00:00:00Z")],
  ["Bee & Cee <test>", "5000001", "bee@example.com", "Treasurer", new Date("1900-01-01T00:00:00Z"), new Date("1899-12-31T00:00:00Z")],
]);
const rebuilt = readZip(filled);
assert.deepEqual(
  [...rebuilt.keys()].sort(),
  [...original.keys()].sort(),
  "the filled workbook lost or gained a part"
);
for (const name of original.keys()) {
  if (name === "xl/worksheets/sheet1.xml") continue;
  assert.deepEqual(rebuilt.get(name), original.get(name), `${name} changed while filling the template`);
}

const sheet = sheetOf(filled);
assert.ok(sheet.includes("<row r=\"1\">"), "heading row was dropped");
// Row 2 points at the shared-string table rather than holding its own text, which
// is exactly why the table has to survive alongside it.
assert.ok(/<row r="2"[^>]*>[\s\S]*?<c /.test(sheet), "Arc's example row was dropped");
assert.ok(
  rebuilt.get("xl/sharedStrings.xml")!.toString("utf8").includes("Firstname Middlename Lastname"),
  "the shared-string table behind the example row was dropped"
);
assert.ok(sheet.includes("<is><t>Ada Lovelace</t></is>"), "name did not reach the sheet");
assert.ok(sheet.includes("<v>5123456</v>"), "numeric zID did not reach the sheet");

// Excel counts days from 1899-12-30; a wrong epoch silently shifts every date.
assert.ok(sheet.includes("<v>46023</v>"), "2026-01-01 should be serial 46023");
assert.ok(sheet.includes("<v>46387</v>"), "2026-12-31 should be serial 46387");
assert.ok(sheet.includes("<v>2</v>"), "1900-01-01 should be serial 2");
assert.ok(sheet.includes("<v>1</v>"), "1899-12-31 should be serial 1");

// Unescaped user text is the one input here that can produce a corrupt workbook.
assert.ok(sheet.includes("Bee &amp; Cee &lt;test&gt;"), "cell text was not XML-escaped");
for (const [, text] of sheet.matchAll(/<t>([\s\S]*?)<\/t>/g)) {
  assert.ok(!text.includes("<"), `raw < leaked into a cell: ${text}`);
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(text), `raw & leaked into a cell: ${text}`);
}

// Row 3 keeps the template's own cell styles, which is what keeps dates as dates.
const templateStyles = /<row r="3"[^>]*>([\s\S]*?)<\/row>/.exec(sheetOf(readFileSync(path(TEMPLATES.EXECUTIVE.file))))![1];
const writtenStyles = /<row r="3"[^>]*>([\s\S]*?)<\/row>/.exec(sheet)![1];
const styleIds = (xml: string) => [...xml.matchAll(/<c [^>]*?s="(\d+)"/g)].map((m) => m[1]);
assert.deepEqual(styleIds(writtenStyles), styleIds(templateStyles), "generated rows lost the template's styles");

// Each template has its own column count; writing six cells into the five-column
// mentors sheet would push dates into a column Arc doesn't read.
for (const category of AHEGS_CATEGORIES) {
  const cols = TEMPLATES[category].headings.length;
  const one = sheetOf(fillTemplate(path(TEMPLATES[category].file), [Array(cols).fill("x")]));
  const cells = [...(/<row r="3"[^>]*>([\s\S]*?)<\/row>/.exec(one)![1].matchAll(/<c /g))];
  assert.equal(cells.length, cols, `${category}: wrote ${cells.length} cells into ${cols} columns`);
}

// 3. The roster defaults: these decide what lands in the spreadsheet for anyone an
//    exec never opens, which is most of the committee.
const member = {
  membershipId: "m1",
  role: "DIRECTOR" as const,
  portfolioId: "p-creatives",
  title: "Creative Director",
  isActive: true,
  joinedAt: new Date("2024-03-05T00:00:00Z"),
  name: "Cleo Nguyen",
  email: "cleo@example.com",
  zId: "z5123456",
};
const row = resolveRow(member, undefined, 2026);
assert.equal(row.category, "MENTOR", "directors are the club's mentors");
assert.equal(row.zid, "5123456", "the leading z must be stripped");
assert.equal(row.startDate, "2026-01-01", "an earlier join date clamps to the start of the year");
assert.equal(row.endDate, "2026-12-31");
assert.equal(row.position, "Creative Director");
assert.deepEqual(rowProblems(row), []);

const joinedMidYear = resolveRow({ ...member, joinedAt: new Date("2026-04-02T00:00:00Z") }, undefined, 2026);
assert.equal(joinedMidYear.startDate, "2026-04-02", "a join date inside the year is kept");

assert.equal(resolveRow({ ...member, isActive: false }, undefined, 2026).included, false, "former members are off by default");
assert.equal(
  resolveRow({ ...member, isActive: false }, { included: true }, 2026).included,
  true,
  "an exec can put a former member back on"
);
assert.equal(
  resolveRow(member, { fullName: "Cleopatra Nguyen" }, 2026).fullName,
  "Cleopatra Nguyen",
  "the Student ID name overrides the directory name"
);

assert.deepEqual(rowProblems({ ...row, zid: "z5123456" }), ["zID must be 7 digits, without the z"]);
// Arc's template carries a validation rule on the zID column; ours must agree with it.
assert.deepEqual(rowProblems({ ...row, zid: "9999999" }), ["zID outside the range Arc accepts"]);
assert.deepEqual(rowProblems({ ...row, zid: "3000000" }), [], "the bottom of Arc's range is valid");
assert.deepEqual(rowProblems({ ...row, zid: "" }), ["zID must be 7 digits, without the z"]);
assert.deepEqual(rowProblems({ ...row, endDate: "2026-01-01", startDate: "2026-06-01" }), ["ends before it starts"]);
assert.deepEqual(rowProblems({ ...row, category: "SUBCOMMITTEE", position: "" }), ["no position"]);
assert.deepEqual(rowProblems({ ...row, category: "MENTOR", position: "" }), [], "mentors have no position column");

// 4. Hours. These decide who the club puts forward, so a wrong sum quietly drops
//    someone from recognition they earned.
const meetings = [
  { hours: 1.5, attendeeIds: ["m1", "m2"] },
  { hours: 2, attendeeIds: ["m1"] },
  { hours: 0.25, attendeeIds: ["m2"] },
];
assert.deepEqual(hoursFromMeetings("m1", meetings), { meetingCount: 2, meetingHours: 3.5 });
assert.deepEqual(hoursFromMeetings("m2", meetings), { meetingCount: 2, meetingHours: 1.75 });
assert.deepEqual(hoursFromMeetings("nobody", meetings), { meetingCount: 0, meetingHours: 0 });
assert.deepEqual(hoursFromMeetings("m1", []), { meetingCount: 0, meetingHours: 0 });

// Float sums must not surface as 0.30000000000000004 in the UI.
assert.equal(
  hoursFromMeetings("m1", [
    { hours: 0.1, attendeeIds: ["m1"] },
    { hours: 0.2, attendeeIds: ["m1"] },
  ]).meetingHours,
  0.3
);

const withHours = resolveRow(member, undefined, 2026, meetings);
assert.equal(withHours.meetingHours, 3.5);
assert.equal(withHours.meetingCount, 2);
assert.equal(withHours.totalHours, 3.5, "no adjustment means hours are the meeting sum");

const adjusted = resolveRow(member, { hoursAdjustment: 2.5 }, 2026, meetings);
assert.equal(adjusted.totalHours, 6, "the adjustment is added to the meeting hours");
const docked = resolveRow(member, { hoursAdjustment: -1.5 }, 2026, meetings);
assert.equal(docked.totalHours, 2, "a negative adjustment corrects an over-credit");

// 5. Scoping. A director must not reach another portfolio, and subcommittee members
//    have no access at all (the routes require DIRECTOR, so they never get this far).
const exec = ahegsScope("EXECUTIVE", null);
const director = ahegsScope("DIRECTOR", "p-creatives");
const strayDirector = ahegsScope("DIRECTOR", null);

assert.equal(exec.isExec, true);
assert.equal(exec.portfolioId, null, "an executive is not pinned to one portfolio");
assert.equal(canTouchPortfolio(exec, "p-creatives"), true);
assert.equal(canTouchPortfolio(exec, null), true, "executives cover the unassigned too");

assert.equal(canTouchPortfolio(director, "p-creatives"), true, "own portfolio, which includes themselves");
assert.equal(canTouchPortfolio(director, "p-ctf"), false, "another portfolio is off limits");
assert.equal(canTouchPortfolio(director, null), false, "executives' rows carry no portfolio");

// A director whose title isn't in the society's list has no portfolio: they must see
// nobody rather than everybody with a null portfolio.
assert.equal(canTouchPortfolio(strayDirector, null), false, "a portfolio-less director sees nobody");
assert.equal(canTouchPortfolio(strayDirector, "p-creatives"), false);

async function checkMerge() {
  // 6. The merge. Arc wants one file per slot, and a submission assembled the night
  //    before the deadline is not the time to discover a corrupt PDF broke everything.
  async function pdfOf(pages: number): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
    return doc.save();
  }
  const source = (title: string, bytes: Uint8Array) => ({
    title, date: "1 Mar 2026", hours: 1.5, attendees: 4, bytes,
  });

  const twoPage = await pdfOf(2);
  const threePage = await pdfOf(3);
  const merged = await mergeMinutes("Sub-Committee attendance 2026", [
    source("CTF weekly", twoPage),
    source("Socials planning", threePage),
  ]);
  // 2 + 3 documents pages, plus the contents page inserted at the front.
  assert.equal(merged.pages, 6, `expected 6 pages, got ${merged.pages}`);
  assert.deepEqual(merged.failed, []);
  assert.ok(merged.pdf.length > 0);
  assert.equal(
    Buffer.from(merged.pdf.slice(0, 5)).toString(),
    "%PDF-",
    "output is not a PDF"
  );
  // It must be readable back, not merely produced.
  assert.equal((await PDFDocument.load(merged.pdf)).getPageCount(), 6);

  // One unreadable document is named and skipped rather than sinking the whole merge.
  const withJunk = await mergeMinutes("Mentors commitment 2026", [
    source("Good minutes", twoPage),
    source("Corrupt minutes", new Uint8Array([1, 2, 3, 4])),
  ]);
  assert.deepEqual(withJunk.failed, ["Corrupt minutes"]);
  assert.equal(withJunk.pages, 3, "the good document and the contents page still come through");

  // A single document still gets its contents page, so the output shape never varies.
  assert.equal((await mergeMinutes("One", [source("Only", twoPage)])).pages, 3);

  console.log(
    `✅ ahegs: ${AHEGS_CATEGORIES.length} templates blank and fillable, ` +
      `${rebuilt.size} workbook parts preserved, dates on Excel's epoch, roster defaults from the directory, ` +
      `hours summed from attendance, portfolio scoping enforced, minutes merge into one PDF`
  );
}

void checkMerge();
