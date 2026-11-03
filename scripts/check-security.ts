// Pins the fixes from the security audit (docs/audit/AUDIT_REPORT.md), so a later
// change can't quietly undo one.
//   npx tsx scripts/check-security.ts
import assert from "node:assert/strict";
import { escapeHtml, notificationEmail } from "../src/lib/email";
import { debugToolsEnabled } from "../src/lib/debugTools";

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

console.log("✅ security: audit fixes still in place");
