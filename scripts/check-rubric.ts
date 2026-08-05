// Guards the Rubric integration against the vulnerability it just had: a browser
// holding the society's Rubric session ID.
//   npx tsx scripts/check-rubric.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { RUBRIC_CALLS, canCall, scrubResponse } from "../src/lib/rubricCalls";
import { encryptSecret, decryptSecret } from "../src/lib/secrets";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

const files = walk("src").map((f) => [f, readFileSync(f, "utf8")] as const);
const PROXY = "src/app/api/societies/[society]/rubric/call/route.ts";

// 1. Only the proxy may talk to Rubric, and only it may read the session ID.
const callers = files.filter(([f, s]) => s.includes("api.hellorubric.com") && !f.endsWith("route.ts"));
assert.deepEqual(callers.map(([f]) => f), [], "only the server proxy may call Rubric directly");

const rubricHosts = files.filter(([, s]) => s.includes("https://api.hellorubric.com"));
assert.deepEqual(
  rubricHosts.map(([f]) => f.replace(/\\/g, "/")),
  [PROXY],
  "api.hellorubric.com must appear only in the proxy route"
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
const proxySource = files.find(([f]) => f.replace(/\\/g, "/") === PROXY)?.[1] ?? "";
assert.match(proxySource, /spec\.write \|\| spec\.pii/, "the proxy must audit log pii reads, not just writes");

// 6. Bulk reads are rate limited: the allowlist decides what a member may call,
// this decides how often, which is what stops a slow scrape of the member list.
assert.match(proxySource, /rateLimited\(/, "the proxy must rate limit Rubric calls");
assert.match(proxySource, /status:\s*429/, "the rate limiter must answer 429");

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

const writes = Object.entries(RUBRIC_CALLS).filter(([, s]) => s.write).length;
console.log(
  `✅ rubric: ${Object.keys(RUBRIC_CALLS).length} allowlisted calls (${writes} writes, exec-only, ` +
    `${piiCalls.length} pii reads audited), ${used.size} used by the UI, ` +
    `session ID confined to the server and encrypted at rest`
);
