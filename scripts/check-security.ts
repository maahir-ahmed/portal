// Pins the fixes from the security audit (docs/audit/AUDIT_REPORT.md), so a later
// change can't quietly undo one.
//   npx tsx scripts/check-security.ts
import assert from "node:assert/strict";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { escapeHtml, isPrivateAddress, notificationEmail, publicMailAddress } from "../src/lib/email";
import { debugToolsEnabled, MIN_FREE_BYTES, uploadFits } from "../src/lib/debugTools";
import { ownsServerSettings } from "../src/lib/serverSettings";
import { isPlausibleDate, safeCallback, sameHost } from "../src/lib/utils";
import { freshInteraction } from "../src/lib/discordBot";
import { csvCell } from "../src/lib/csv";
import { tempPassphraseExpiry } from "../src/lib/passphrase";
import { httpUrl, money, notDemo, plainDate, plausibleDate, time24 } from "../src/lib/schemas";
import { UPLOADED_FILE } from "../src/lib/uploads";
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

// The email and bot settings are one row per deployment: only the stack's own slug may reach them.
assert.equal(ownsServerSettings("secsoc"), false, "no SOCIETY_SLUG: the settings routes are refused");
env({ SOCIETY_SLUG: "secsoc" });
assert.equal(ownsServerSettings("secsoc"), true);
assert.equal(ownsServerSettings("other"), false, "another society's slug must not reach the settings");
env({ SOCIETY_SLUG: undefined });

// "Send test email" connects out, so a mail server on a private address is refused.
for (const ip of ["127.0.0.1", "10.1.2.3", "172.17.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"]) assert.ok(isPrivateAddress(ip), ip);
for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "172.32.0.1"]) assert.ok(!isPrivateAddress(ip), ip);

// After sign-in, only ever a path on this site.
for (const evil of ["https://evil.example/login", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null]) {
  assert.equal(safeCallback(evil), "/", `callbackUrl ${evil} must not leave the site`);
}
assert.equal(safeCallback("/requests/treasury?x=1"), "/requests/treasury?x=1", "a path still works");

// Typed-in dates: real ones between 2000 and 2100, nothing a year picker can't lay out.
for (const ok of ["2026-11-04", "2026-11-04T18:00", "2026-11-04T07:00:00.000Z", "2100-12-31"]) assert.ok(isPlausibleDate(ok), ok);
for (const bad of ["20255-01-01", "+275760-09-13", "1999-12-31", "not a date", ""]) assert.ok(!isPlausibleDate(bad), bad);

// Links shown to members or encoded in a QR code: http(s) only. Deliverables: our own uploads only.
for (const ok of ["https://rubric.example/e/1", "http://x.test/a?b=1"]) assert.ok(httpUrl.safeParse(ok).success, ok);
for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "/uploads/a.png", "https://a b", ""]) assert.ok(!httpUrl.safeParse(bad).success, bad);
assert.ok(UPLOADED_FILE.test("/uploads/0f8fad5b-d9cb-469f-a165-70867728950e.png"));
for (const bad of ["https://evil.example/x.png", "javascript:alert(1)", "/uploads/../x.png"]) assert.ok(!UPLOADED_FILE.test(bad), bad);

// The date inputs the audit found unchecked: garbage and far-future values are refused.
assert.ok(plausibleDate.safeParse("2026-11-04T18:00").success && plainDate.safeParse("2026-11-04").success);
for (const bad of ["garbage", "+275760-09-13", "2999-01-01", ""]) assert.ok(!plausibleDate.safeParse(bad).success, bad);
for (const bad of ["2026-11-04T18:00", "04/11/2026", "2999-01-01"]) assert.ok(!plainDate.safeParse(bad).success, bad);

// Money fits Decimal(10,2): capped, rounded to cents, never Infinity or negative.
assert.equal(money.parse(12.345), 12.35);
assert.equal(money.parse(99_999_999.99), 99_999_999.99);
for (const bad of [1e8, -1, Infinity, NaN]) assert.ok(!money.safeParse(bad).success, String(bad));
assert.ok(time24.safeParse("09:30").success && !time24.safeParse("9:30").success && !time24.safeParse("24:00").success);

// The tour's demo marker can't be typed into a real record.
assert.ok(!notDemo(z.string()).safeParse("[Tutorial demo] Posters").success);
assert.ok(notDemo(z.string()).safeParse("Posters [Tutorial demo]").success);

// /print: a signed request is only good for a few minutes, so a captured one can't be replayed.
const now = Date.UTC(2026, 10, 4, 12, 0, 0);
assert.ok(freshInteraction(String(now / 1000 - 10), now), "a request from 10 seconds ago is fine");
assert.ok(!freshInteraction(String(now / 1000 - 3600), now), "an hour-old request is a replay");
assert.ok(!freshInteraction("not a number", now));
assert.ok(!freshInteraction(null, now));

// Password guessing: ten wrong tries from one address lock the account there for the
// window, a right one resets it, and failures from elsewhere never lock the owner out.
const limits = passwordLimits("Jane@Example.com", new Headers({ "x-real-ip": "203.0.113.9" }));
for (let i = 0; i < 9; i++) recordFailure(limits, now);
assert.ok(!isLimited(limits, now), "nine wrong passwords are still allowed");
clearFailures(limits);
for (let i = 0; i < 10; i++) recordFailure(limits, now);
assert.ok(isLimited(limits, now), "the tenth wrong password locks the account");
assert.ok(
  isLimited(passwordLimits("jane@example.com", new Headers({ "x-real-ip": "203.0.113.9" })), now),
  "case doesn't dodge the lock"
);
assert.ok(
  !isLimited(passwordLimits("jane@example.com", new Headers({ "x-real-ip": "198.51.100.7" })), now),
  "failures from one address must not lock the account's real owner out elsewhere"
);
assert.ok(!isLimited(limits, now + 16 * 60_000), "the lock lifts after the window");
// Spreading the guesses over many addresses still caps out on the account itself.
for (let i = 0; i < 100; i++) {
  recordFailure(passwordLimits("spread@example.com", new Headers({ "x-real-ip": `192.0.2.${i % 40}` })), now);
}
assert.ok(
  isLimited(passwordLimits("spread@example.com", new Headers({ "x-real-ip": "203.0.113.77" })), now),
  "a hundred failures across addresses cap the account"
);

// Spreadsheet exports: a ticket holder named "=HYPERLINK(...)" stays text.
assert.equal(csvCell('=HYPERLINK("http://evil","x")'), `"'=HYPERLINK(""http://evil"",""x"")"`);
assert.equal(csvCell("@SUM(A1)"), `"'@SUM(A1)"`);
assert.equal(csvCell("Ada Lovelace"), `"Ada Lovelace"`, "ordinary text is unchanged");

// The restore guard in deploy/backup.sh: run its own awk program (extracted, not
// re-implemented) against dumps it must accept and reject. The second layer, psql's
// restricted mode, needs a live database, so here it is only pinned as present.
{
  const backupSh = readFileSync(new URL("../deploy/backup.sh", import.meta.url), "utf8");
  const awkProg = backupSh.match(/awk '([^']+)' "\$into\/database\.sql"/)?.[1];
  assert.ok(awkProg, "the dump guard's awk program must be in backup.sh");
  const runGuard = (dump: string) => {
    const r = spawnSync("awk", [awkProg!], { input: dump, encoding: "utf8" });
    assert.equal(r.error, undefined);
    return r.status === 0;
  };
  const goodDump = [
    "-- PostgreSQL database dump",
    "\\restrict k3y_0k",
    "SET statement_timeout = 0;",
    "COPY public.\"User\" (id, name) FROM stdin;",
    "u1\tBack\\\\slash in data is fine",
    "\\.",
    "SELECT 1;",
    "\\unrestrict k3y_0k",
    "",
  ].join("\n");
  assert.ok(runGuard(goodDump), "a real pg_dump shape must pass the guard");
  assert.ok(!runGuard('SELECT 1; \\echo oops\n'), "a psql command after SQL on the same line must be refused");
  assert.ok(!runGuard('SELECT 1;\n\\echo oops\n'), "a psql command at line start must be refused");
  assert.ok(!runGuard("\\restrict 'not a plain key'\n"), "a restrict line with extra content must be refused");
  assert.ok(backupSh.includes("printf '\\\\restrict %s\\n' \"$restrict_key\""),
    "restore() must put psql in restricted mode before the dump");
  assert.ok(backupSh.includes("grep -Ev '^\\\\(restrict|unrestrict) '"),
    "restore() must drop the dump's own restrict pair, whose key differs from ours");
}

// The Origin check on API writes: this host (whatever the port), never a sibling.
assert.ok(sameHost("https://secsoc.maahir.dev", "secsoc.maahir.dev"));
assert.ok(sameHost("http://localhost:8080", "localhost"), "nginx drops the port from Host");
assert.ok(!sameHost("https://evil.maahir.dev", "secsoc.maahir.dev"), "a sibling subdomain is another site");
assert.ok(!sameHost("null", "secsoc.maahir.dev"));

// A temporary passphrase expires in about a week, and sign-in enforces it only while the
// passphrase is still the temporary one.
const days = (tempPassphraseExpiry().getTime() - Date.now()) / 864e5;
assert.ok(days > 6.9 && days <= 7, "a temporary passphrase lasts about 7 days");
assert.match(
  readFileSync("src/lib/auth.ts", "utf8"),
  /mustChangePassword && user\.tempPasswordExpires && user\.tempPasswordExpires < new Date\(\)/,
  "authorize must refuse an expired temporary passphrase",
);

// SOC-SEC-006: a restore upload can't run the disk down past the floor, and the server
// checks the whole archive on its first chunk.
assert.equal(uploadFits(MIN_FREE_BYTES + 100, 100), true);
assert.equal(uploadFits(MIN_FREE_BYTES + 100, 101), false, "an upload that leaves less than the floor is refused");
assert.ok(MIN_FREE_BYTES >= 1024 ** 3, "the free-space floor is at least 1GB");
const debugServer = readFileSync("src/lib/debugServer.ts", "utf8");
assert.match(debugServer, /clearOtherUploads\(path\)/, "starting an upload deletes any other, so only one is ever on disk");
assert.match(debugServer, /x-upload-size/, "the first chunk is checked against the whole archive's size");

// A form that holds a password posts it: with no method, a submit before the page's script
// loads sends it as a GET, into the URL, the access log and the browser history.
for (const f of ["src/app/(auth)/login/LoginForm.tsx", "src/app/setup/FirstAccountForm.tsx", "src/components/shared/ChangePasswordDialog.tsx", "src/app/[society]/account/page.tsx", "src/components/settings/EmailSettings.tsx", "src/app/[society]/requests/treasury/new/page.tsx"]) {
  for (const form of readFileSync(f, "utf8").match(/<form\b[^>]*>/g) ?? []) {
    assert.match(form, /method="post"/, `${f}: a form with a password or bank details must say method="post"`);
  }
}

// Resolving is async, so this runs last.
(async () => {
  assert.equal(await publicMailAddress("localhost"), null, "a name that resolves to loopback is refused");
  assert.equal(await publicMailAddress("127.0.0.1"), null);
  console.log("✅ security: audit fixes still in place");
})();
