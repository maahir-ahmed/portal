// Guards the Rubric integration against the vulnerability it just had: a browser
// holding the society's Rubric session ID.
//   npx tsx scripts/check-rubric.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { RATE_MAX, RATE_WINDOW_MS, RUBRIC_CALLS, canCall, rubricRateLimited, scrubResponse } from "../src/lib/rubricCalls";
import { encryptSecret, decryptSecret } from "../src/lib/secrets";
import { anonymisePeople } from "../src/lib/rubricDemo";
import { tierForMembers } from "../src/lib/printing";
import snapshot from "../src/lib/rubricDemoSnapshot.json";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

const files = walk("src").map((f) => [f, readFileSync(f, "utf8")] as const);
const PROXY = "src/app/api/societies/[society]/rubric/call/route.ts";
// The one function that sends the session to Rubric (postRubric), used by the proxy.
const RUBRIC_CLIENT = "src/lib/rubric.ts";

// 1. Only postRubric may talk to Rubric.
// The bare host, not the URL: any spelling of it (http://, a template string) counts.
// scripts/ too: a script that called Rubric directly would be another holder of the session.
// This file is skipped, since it has to name the host to look for it.
const scriptFiles = walk("scripts")
  .filter((f) => f.replace(/\\/g, "/") !== "scripts/check-rubric.ts")
  .map((f) => [f, readFileSync(f, "utf8")] as const);
const rubricHosts = [...files, ...scriptFiles].filter(([, s]) => s.includes("api.hellorubric.com"));
assert.deepEqual(
  rubricHosts.map(([f]) => f.replace(/\\/g, "/")),
  [RUBRIC_CLIENT],
  "api.hellorubric.com must appear only in postRubric (src/lib/rubric.ts)"
);

// The settings form is the one place a credential legitimately passes through the
// browser: an executive types it in and it goes up to the server. It only ever
// sends, never receives, which is why it is excepted by name rather than by rule.
const CREDENTIAL_ENTRY_FORM = "src/components/settings/RubricSettings.tsx";

const clientHandlesSecret = files.filter(
  ([f, s]) =>
    s.includes('"use client"') &&
    f.replace(/\\/g, "/") !== CREDENTIAL_ENTRY_FORM &&
    /rubricSessionId|sessionid:|unionSessionID/.test(s)
);
assert.deepEqual(
  clientHandlesSecret.map(([f]) => f),
  [],
  "no client component may handle a Rubric session ID"
);

// ...and even that one must not read a credential back out of a response.
const entryForm = files.find(([f]) => f.replace(/\\/g, "/") === CREDENTIAL_ENTRY_FORM);
assert.ok(entryForm, "credential entry form not found, update CREDENTIAL_ENTRY_FORM");
assert.equal(
  /rubricSessionId\s*[:=]\s*(data|res|json|body)/.test(entryForm[1]),
  false,
  "the credential form must never read a session ID out of a response"
);

// 2. Every call the UI makes must be in the allowlist, or it 400s at runtime.
const used = new Set<string>();
for (const [, s] of files) {
  for (const m of s.matchAll(/rubric\.call\(\{\s*\n?\s*type:\s*"([^"]+)"/g)) used.add(m[1]);
  for (const m of s.matchAll(/call\(\{\s*type:\s*"([^"]+)"/g)) used.add(m[1]);
}
// A drift in how the UI writes its calls would otherwise make this check pass on an empty set.
assert.ok(used.size > 0, "no UI call to Rubric was found: the call-site patterns above no longer match the code");
const missing = [...used].filter((t) => !RUBRIC_CALLS[t]);
assert.deepEqual(missing, [], `UI calls Rubric types that are not allowlisted: ${missing.join(", ")}`);

// 3. Role floor: nothing is reachable by subcommittee, every write is exec-only.
for (const [type, spec] of Object.entries(RUBRIC_CALLS)) {
  assert.ok(!canCall("SUBCOMMITTEE", spec), `${type} must not be reachable by SUBCOMMITTEE`);
  if (spec.write) {
    assert.equal(spec.minRole, "EXECUTIVE", `${type} writes to Rubric, so it must be executive-only`);
    assert.ok(!canCall("DIRECTOR", spec), `${type} must not be reachable by DIRECTOR`);
  }
}

// 4. Credentials never travel back, at any depth; ordinary data survives.
const scrubbed = scrubResponse({
  success: true,
  rotating_session_ID: "leak",
  sessionid: "leak",
  unionSessionID: "leak",
  event: { name: "CTF", sessions: [{ id: 1, sessionId: "leak" }] },
  list: [{ sessionID: "leak", keep: 2 }],
}) as {
  success: boolean;
  event: { sessions: { id: number }[] };
  list: { keep: number }[];
};
assert.equal(JSON.stringify(scrubbed).includes("leak"), false, "scrubResponse left a credential in the response");
assert.equal(scrubbed.event.sessions[0].id, 1, "scrubResponse ate legitimate data");
assert.equal(scrubbed.list[0].keep, 2, "scrubResponse ate legitimate data");
assert.equal(scrubbed.success, true);

// 5. Calls that return personal data are flagged, and the proxy logs them. The
// reported impact was bulk PII exfiltration, so "who read what" must be answerable.
const piiCalls = Object.entries(RUBRIC_CALLS).filter(([, s]) => s.pii);
assert.ok(piiCalls.length > 0, "no call is marked pii — the flag has been dropped");
// Comments stripped, so a comment cannot stand in for code that was deleted.
const proxySource = (files.find(([f]) => f.replace(/\\/g, "/") === PROXY)?.[1] ?? "").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
assert.match(proxySource, /spec\.write \|\| spec\.pii/, "the proxy must audit log pii reads, not just writes");

// 6. Bulk reads are rate limited: the allowlist decides what a member may call,
// this decides how often, which is what stops a slow scrape of the member list.
assert.match(proxySource, /if \(rubricRateLimited\(/, "the proxy must rate limit Rubric calls");
assert.match(proxySource, /status:\s*429/, "the rate limiter must answer 429");
// ...and the limiter itself, run: the cap, per user, and the window reopening.
const t0 = 1_000_000;
for (let n = 0; n < RATE_MAX; n++) assert.equal(rubricRateLimited("limiter-a", t0), false, `call ${n + 1} is within the cap`);
assert.equal(rubricRateLimited("limiter-a", t0), true, "the call past the cap must be refused");
assert.equal(rubricRateLimited("limiter-b", t0), false, "one member's use must not limit another");
assert.equal(rubricRateLimited("limiter-a", t0 + RATE_WINDOW_MS + 1), false, "the limit must lift once the window has passed");

// 7. The stored session survives a round trip and the ciphertext does not contain it.
// Both key states matter: unset (existing deployments) and set.
const SESSION = "s3ss10n-abcdef0123456789";
delete process.env.RUBRIC_SECRET_KEY;
assert.equal(decryptSecret(encryptSecret(SESSION)), SESSION, "plaintext fallback must round-trip");
process.env.RUBRIC_SECRET_KEY = Buffer.alloc(32, 7).toString("base64");
const sealed = encryptSecret(SESSION);
assert.equal(sealed.includes(SESSION), false, "encryptSecret left the session readable");
assert.equal(decryptSecret(sealed), SESSION, "decryptSecret did not recover the session");
assert.equal(decryptSecret(SESSION), SESSION, "a session stored before a key was set must stay readable");
assert.notEqual(encryptSecret(SESSION), sealed, "encryptSecret must not reuse an IV");
assert.throws(
  () => decryptSecret(sealed.slice(0, -4) + "AAAA"),
  "a tampered ciphertext must not decrypt (GCM tag)"
);

// 8. The demo snapshot is served to a site with no login, so it must name nobody
// real, and the anonymiser must not eat the fields the demo renders.
const person = anonymisePeople({
  allMemberships: [{ fullname: "Real Person", email: "real@unsw.edu.au", responses: { "Student Number": "z9999999", Degree: "Computer Science" } }],
  members: [{ name: "Real Exec", accepted: true, role: { name: "President" } }],
  listings: [{ name: "Society Hoodie", price: "45.00" }],
  fundingsummary: [{ title: "Base Grant", totalgrant: "3000.00" }],
}) as Record<string, Record<string, Record<string, string>>[]>;
assert.notEqual(person.allMemberships[0].fullname, "Real Person", "member names must be replaced");
assert.notEqual(person.allMemberships[0].email, "real@unsw.edu.au", "member emails must be replaced");
assert.notEqual(person.allMemberships[0].responses["Student Number"], "z9999999", "zIDs must be replaced");
assert.equal(person.allMemberships[0].responses.Degree, "Computer Science", "degrees are not personal, keep them");
assert.notEqual(person.members[0].name, "Real Exec", "team member names must be replaced");
assert.equal(person.members[0].role.name, "President", "a role is not a person; anonymising it corrupts the demo");
assert.equal(person.listings[0].name, "Society Hoodie", "merch names must survive");
assert.equal(person.fundingsummary[0].totalgrant, "3000.00", "grant figures must survive");

// Rubric's other spellings of the same personal fields (ticket lists, form answers).
const tickets = anonymisePeople({
  allTickets: [{ firstname: "Real", lastname: "Person", phonenumber: "0400111222", studentnumber: "z9999999", "Phone Number": "0400", "Student ID": "z8888888" }],
}) as { allTickets: Record<string, string>[] };
const t = tickets.allTickets[0];
assert.notEqual(t.firstname, "Real", "first names must be replaced");
assert.notEqual(t.lastname, "Person", "last names must be replaced");
assert.equal(t.phonenumber, "", "phone numbers must be blanked");
assert.equal(t["Phone Number"], "", "phone answers must be blanked");
assert.notEqual(t.studentnumber, "z9999999", "student numbers must be replaced");
assert.notEqual(t["Student ID"], "z8888888", "student ID answers must be replaced");

// A student number or phone Rubric returns as a JSON number is replaced too.
const numeric = anonymisePeople({ rows: [{ studentnumber: 9999999, phone: 412345678, studentsAttending: 12, email: "a@b.c" }] }) as { rows: Record<string, unknown>[] };
assert.notEqual(numeric.rows[0].studentnumber, 9999999, "numeric student numbers must be replaced");
assert.equal(numeric.rows[0].phone, "", "numeric phone numbers must be blanked");
assert.equal(numeric.rows[0].studentsAttending, 12, "a small count under a student key must survive");

// The committed snapshot holds no credential under any spelling.
const credentialKeys: string[] = [];
const walkKeys = (v: unknown): void => {
  if (Array.isArray(v)) return v.forEach(walkKeys);
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (/session[_-]?id|rotating_session/i.test(k)) credentialKeys.push(k); walkKeys(x); }
};
walkKeys(snapshot);
assert.deepEqual(credentialKeys, [], "the demo snapshot must not contain a Rubric session");

// The committed fixture itself must already be clean.
const fixture = JSON.stringify(snapshot);
assert.equal(/unsw\.edu\.au|@gmail|@outlook/i.test(fixture), false, "the demo snapshot contains a real-looking address");

// No run of seven or more digits anywhere in the committed snapshot: that is a zID or a phone
// number. The anonymiser's own placeholders (z5000001 and up) and fields that are never about a
// person (ids, timestamps, money) are exempt; anything else means a real capture slipped through.
const SAFE_NUMERIC = /(^id|id$|time|date|created|updated|price|total|amount|grant)/i;
const PERSON_KEY = /student|zid|phone|mobile/i;
const digitRuns: string[] = [];
const walkDigits = (v: unknown, key = ""): void => {
  if (Array.isArray(v)) return v.forEach((x) => walkDigits(x, key));
  if (v && typeof v === "object") return Object.entries(v).forEach(([k, x]) => walkDigits(x, k));
  if (SAFE_NUMERIC.test(key) && !PERSON_KEY.test(key)) return;
  if (/\d{7,}/.test(String(v).replace(/z5\d{6}/g, ""))) digitRuns.push(key);
};
walkDigits(snapshot);
assert.deepEqual(digitRuns, [], "the demo snapshot contains a long digit run (a student number or phone?)");

const writes = Object.entries(RUBRIC_CALLS).filter(([, s]) => s.write).length;
console.log(
  `✅ rubric: ${Object.keys(RUBRIC_CALLS).length} allowlisted calls (${writes} writes, exec-only, ` +
    `${piiCalls.length} pii reads audited), ${used.size} used by the UI, ` +
    `session ID confined to the server and encrypted at rest, ` +
    `demo snapshot (${snapshot.capturedAt ?? "sample data"}) anonymised`
);

// 9. The member count picks Arc's club tier, and so the secretarial allowance.
for (const [count, tier] of [[0, "BRONZE"], [74, "BRONZE"], [75, "SILVER"], [249, "SILVER"], [250, "GOLD"], [1000, "GOLD"]] as const) {
  assert.equal(tierForMembers(count), tier, `${count} members should be ${tier}`);
}
