// Guards the feature-module path map (src/lib/modules.ts): a switched-off module must
// refuse its pages and API, and nothing else.
import assert from "node:assert/strict";
import { ALL_ON, apiEnabled, moduleForApi, moduleForPage, pageEnabled } from "../src/lib/modules";

const off = (k: keyof typeof ALL_ON) => ({ ...ALL_ON, [k]: false });

// Prefixes match on a segment boundary, and the longest wins.
assert.equal(moduleForPage("/requests/content/abc/edit"), "events");
assert.equal(moduleForPage("/requests/contents"), null);
assert.equal(moduleForPage("/rubric/grants"), "grants");
assert.equal(moduleForPage("/rubric/events/1"), "ticketing");
assert.equal(moduleForPage("/settings/rubric"), "ticketing");
assert.equal(moduleForPage("/requests/treasury/new"), null);
assert.equal(moduleForApi("/budget/categories/x"), "budget");
assert.equal(moduleForApi("/rubric/credentials"), null); // Settings still saves credentials

// Grants live inside the Rubric portal, so they need it on too.
assert.equal(pageEnabled(off("ticketing"), "/rubric/grants"), false);
assert.equal(pageEnabled(off("grants"), "/rubric/events"), true);

// Submitting an event to Rubric is a Rubric call even though it hangs off the event.
assert.equal(apiEnabled(off("ticketing"), "/content-requests/abc/rubric"), false);
assert.equal(apiEnabled(off("ticketing"), "/content-requests/abc"), true);
assert.equal(apiEnabled(off("events"), "/events"), false);

// Always-on sections are never refused.
for (const k of Object.keys(ALL_ON) as (keyof typeof ALL_ON)[]) {
  for (const path of ["/dashboard", "/requests/treasury", "/members", "/settings/general", "/executive/queue"]) {
    assert.equal(pageEnabled(off(k), path), true, `${k} off hid ${path}`);
  }
  assert.equal(apiEnabled(off(k), "/treasury"), true);
}

console.log("✅ module path map");
