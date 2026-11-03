// Guards member import (src/lib/memberImport.ts): the CSV and XLSX readers, and the
// row checks the preview and the commit share.
import assert from "node:assert/strict";
import { parseCsv } from "../src/lib/csv";
import { readTable, writeZip } from "../src/lib/xlsx";
import { checkImport, IMPORT_TEMPLATE, type ImportContext } from "../src/lib/memberImport";

// CSV: BOM, CRLF, quotes, escaped quotes, a newline inside quotes, no trailing newline.
assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",\n3,4'), [
  ["a", "b"],
  ["x, y", 'say "hi"'],
  ["two\nlines", ""],
  ["3", "4"],
]);
assert.deepEqual(parseCsv("a,b\n"), [["a", "b"]]);

// XLSX: shared strings (one split into runs), an inline string, a number, an entity,
// a gap in the columns and an empty self-closing row.
const xml = (s: string) => Buffer.from(`<?xml version="1.0"?>${s}`);
const book = writeZip(
  new Map([
    ["xl/sharedStrings.xml", xml('<sst><si><t>name</t></si><si><r><t>Jo</t></r><r><t xml:space="preserve"> Bloggs</t></r></si></sst>')],
    [
      "xl/worksheets/sheet1.xml",
      xml(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>R&amp;D</t></is></c></row>' +
          '<row r="2" spans="1:3"/><row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><v>1234567</v></c></row></sheetData></worksheet>'
      ),
    ],
  ])
);
assert.deepEqual(readTable(book), [["name", "", "R&D"], [], ["Jo Bloggs", "1234567"]]);
assert.deepEqual(readTable(Buffer.from("name,email\n")), [["name", "email"]]);

const ctx: ImportContext = {
  members: new Set(["old@example.com"]),
  titles: new Map([["events director", { name: "Events Director", roleLevel: "DIRECTOR", portfolioId: "p-events" }]]),
  portfolios: new Map([["events", { id: "p-events", name: "Events" }]]),
};
const run = (csv: string) => checkImport(parseCsv(csv), ctx);

// The template imports cleanly, creating the portfolio it names that doesn't exist.
const t = run(IMPORT_TEMPLATE);
assert.equal(t.error, undefined);
assert.equal(t.rows[0].status, "add");
assert.deepEqual(t.rows[0].portfolios, ["Events", "Marketing"]);
assert.deepEqual(t.newPortfolios, ["Marketing"]);
assert.equal(t.rows[0].title, "Events Director");

// Headers are matched loosely; required columns must be there.
assert.match(run("Name,E-mail,role\n").error!, /Missing: email/);
assert.equal(run("Name , EMAIL,Role\nA,a@x.io,executive\n").rows[0].status, "add");
assert.match(run("name,email,role\n\n").error!, /no members/);

// Every kind of bad row, by line number.
const bad = run(
  [
    "name,email,role,title,portfolios",
    ",a@x.io,Director,,",
    "B,not-an-email,Director,,",
    "C,c@x.io,Boss,,",
    "D,d@x.io,Subcommittee,Events Director,",
    "E,e@x.io,Director,Treasurer,",
    "F,C@X.IO,Director,,",
    "G,old@example.com,Director,,New One",
    "",
  ].join("\n")
);
const by = new Map(bad.rows.map((r) => [r.line, r]));
assert.match(by.get(2)!.problems[0], /Name is empty/);
assert.match(by.get(3)!.problems[0], /isn't an email/);
assert.match(by.get(4)!.problems[0], /Executive, Director or Subcommittee/);
assert.match(by.get(5)!.problems[0], /title for directors/);
assert.match(by.get(6)!.problems[0], /No title called "Treasurer"/);
assert.match(by.get(7)!.problems[0], /further up the file/); // emails compare case-insensitively
assert.equal(by.get(8)!.status, "skip");
assert.equal(bad.rows.length, 7); // the blank line is not a row
assert.deepEqual(bad.newPortfolios, []); // only the skipped row used "New One"

console.log("check-import: ok");
