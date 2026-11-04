// Pins the fixes from the security audit (docs/audit/AUDIT_REPORT.md), so a later
// change can't quietly undo one.
//   npx tsx scripts/check-security.ts
import assert from "node:assert/strict";
import { escapeHtml, notificationEmail } from "../src/lib/email";
import { debugToolsEnabled } from "../src/lib/debugTools";
import { isPlausibleDate, safeCallback } from "../src/lib/utils";
import { freshInteraction } from "../src/lib/discordBot";
import { csvCell } from "../src/lib/csv";
import { clearFailures, isLimited, passwordLimits, recordFailure } from "../src/lib/rateLimit";

// Member-typed text in an executive's notification email stays text.
const evil = `<a href="https://evil/login">Sign in</a><img src=x onerror=alert(1)>"'&`;
const html = notificationEmail(evil, evil, "/requests/1");
assert.equal(html.includes("<a href=\"https://evil"), false, "a member's link must not render in the email");
assert.equal(html.includes("<img"), false, "a member's image must not render in the email");
assert.equal(escapeHtml(`a & b < c > d " e ' f`), "a &#38; b &#60; c &#62; d &#34; e &#39; f");
assert.ok(html.includes("View Details"), "the portal's own link still renders");

// The debugging tools act on the whole database, so only a single-society stack gets
// them: on a multi-society one, any society's executive would hold every society.
const env = (vars: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
};
env({ ENABLE_DEBUG_TOOLS: "true", DEMO_MODE: undefined, SOCIETY_SLUG: "secsoc" });
assert.equal(debugToolsEnabled(), true);
env({ SOCIETY_SLUG: undefined });
assert.equal(debugToolsEnabled(), false, "debug tools must be off on a multi-society stack");
env({ SOCIETY_SLUG: "secsoc", DEMO_MODE: "1" });
assert.equal(debugToolsEnabled(), false, "debug tools must be off on the demo");
env({ ENABLE_DEBUG_TOOLS: undefined, DEMO_MODE: undefined, SOCIETY_SLUG: undefined });

// After sign-in, only ever a path on this site.
for (const evil of ["https://evil.example/login", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null]) {
  assert.equal(safeCallback(evil), "/", `callbackUrl ${evil} must not leave the site`);
}
assert.equal(safeCallback("/requests/treasury?x=1"), "/requests/treasury?x=1", "a path still works");

// Typed-in dates: real ones between 2000 and 2100, nothing a year picker can't lay out.
for (const ok of ["2026-11-04", "2026-11-04T18:00", "2026-11-04T07:00:00.000Z", "2100-12-31"]) assert.ok(isPlausibleDate(ok), ok);
for (const bad of ["20255-01-01", "+275760-09-13", "1999-12-31", "not a date", ""]) assert.ok(!isPlausibleDate(bad), bad);

// /print: a signed request is only good for a few minutes, so a captured one can't be replayed.
const now = Date.UTC(2026, 10, 4, 12, 0, 0);
assert.ok(freshInteraction(String(now / 1000 - 10), now), "a request from 10 seconds ago is fine");
assert.ok(!freshInteraction(String(now / 1000 - 3600), now), "an hour-old request is a replay");
assert.ok(!freshInteraction("not a number", now));
assert.ok(!freshInteraction(null, now));

// Password guessing: ten wrong tries lock the account for the window, a right one resets it.
const limits = passwordLimits("Jane@Example.com", new Headers({ "x-real-ip": "203.0.113.9" }));
for (let i = 0; i < 9; i++) recordFailure(limits, now);
assert.ok(!isLimited(limits, now), "nine wrong passwords are still allowed");
clearFailures(limits);
for (let i = 0; i < 10; i++) recordFailure(limits, now);
assert.ok(isLimited(limits, now), "the tenth wrong password locks the account");
assert.ok(isLimited(passwordLimits("jane@example.com", new Headers()), now), "case doesn't dodge the lock");
assert.ok(!isLimited(limits, now + 16 * 60_000), "the lock lifts after the window");

// Spreadsheet exports: a ticket holder named "=HYPERLINK(...)" stays text.
assert.equal(csvCell('=HYPERLINK("http://evil","x")'), `"'=HYPERLINK(""http://evil"",""x"")"`);
assert.equal(csvCell("@SUM(A1)"), `"'@SUM(A1)"`);
assert.equal(csvCell("Ada Lovelace"), `"Ada Lovelace"`, "ordinary text is unchanged");

console.log("✅ security: audit fixes still in place");
