// Version and channel logic behind the update card and banner (src/lib/updates.ts).
//   npx tsx scripts/check-updates.ts
import assert from "node:assert/strict";
import { newer, newestInChannel, parseImage } from "../src/lib/updates";

assert.deepEqual(parseImage("ghcr.io/maahir-ahmed/portal-app:1"), { registry: "ghcr.io", repo: "maahir-ahmed/portal-app", tag: "1" });
assert.deepEqual(parseImage("127.0.0.1:5000/portal-app:1.4"), { registry: "127.0.0.1:5000", repo: "portal-app", tag: "1.4" });
assert.equal(parseImage("rubric_prod-app"), null, "a hosted stack's local image has no updates");
assert.equal(parseImage(""), null);
assert.equal(parseImage(undefined), null);

assert.ok(newer("1.10.0", "1.9.9"), "numbers, not strings");
assert.ok(newer("2.0.0", "1.99.0"));
assert.ok(!newer("1.4.0", "1.4.0"));
assert.ok(!newer("1.4.0", "1.5.0"));
assert.ok(!newer("1.4.0", "main-abc1234"), "a build between releases is never behind or ahead");
assert.ok(!newer("1.4.0", "source"));

const tags = ["latest", "1", "1.3", "1.3.0", "1.10.0", "1.9.2", "2.0.0", "2", "sha-abc1234", "1.10.0-rc.1"];
assert.equal(newestInChannel(tags, "1"), "1.10.0", "the 1 channel stays on 1.x");
assert.equal(newestInChannel(tags, "1.9"), "1.9.2");
assert.equal(newestInChannel(tags, "2"), "2.0.0");
assert.equal(newestInChannel(tags, "latest"), null, "latest doesn't follow releases");
assert.equal(newestInChannel(tags, "1.3.0"), null, "a pinned version never moves");
assert.equal(newestInChannel(["1.0.0"], "10"), null, "10 isn't a prefix match for 1");

console.log("✅ updates: image names, version order and release channels");
