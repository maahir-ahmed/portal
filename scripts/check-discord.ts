// Guards the /print spike's request check and input parsing (src/lib/discordBot.ts):
// only a request signed with the app's key gets through, and pickup times are read
// as the portal stores them.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { claimCommand, parsePickup, verifyDiscordRequest } from "../src/lib/discordBot";
import { checkBank } from "../src/lib/discordClaim";
import { cut, webhookUrl } from "../src/lib/discordEvents";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const body = '{"type":1}';
const ts = "1762300000";
const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");

assert.equal(verifyDiscordRequest(body, sig, ts, raw), true);
assert.equal(verifyDiscordRequest(body + " ", sig, ts, raw), false, "changed body");
assert.equal(verifyDiscordRequest(body, sig, "1762300001", raw), false, "changed timestamp");
assert.equal(verifyDiscordRequest(body, null, ts, raw), false, "no signature");
assert.equal(verifyDiscordRequest(body, "zz", ts, raw), false, "malformed signature");
const other = generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
assert.equal(verifyDiscordRequest(body, sig, ts, other), false, "another app's key");

assert.equal(parsePickup("2026-11-20 14:00")?.toISOString(), "2026-11-20T14:00:00.000Z");
assert.equal(parsePickup(" 2026-11-20T9:05 ")?.toISOString(), "2026-11-20T09:05:00.000Z");
assert.equal(parsePickup("2026-02-30 10:00"), null, "no such day");
assert.equal(parsePickup("2026-11-20 24:00"), null);
assert.equal(parsePickup("tomorrow"), null);

// Webhook URLs: a pasted ?thread_id= survives, and ours are added, not glued on.
const hook = "https://discord.com/api/webhooks/1/abc";
assert.equal(webhookUrl(`${hook}?thread_id=9`, "", { wait: "true" }), `${hook}?thread_id=9&wait=true`);
assert.equal(webhookUrl(hook, "/messages/5", { thread_id: "5" }), `${hook}/messages/5?thread_id=5`);
assert.equal(webhookUrl(hook, "", { wait: "true", thread_id: null }), `${hook}?wait=true`);
assert.equal(cut("x".repeat(5000), 4096).length, 4096, "embed text fits Discord's limit");

// /claim: Discord refuses a command whose required options come after optional ones,
// and the category only exists in budget mode.
for (const budget of [true, false]) {
  const opts = claimCommand(budget).options;
  const firstOptional = opts.findIndex((o) => !("required" in o && o.required));
  assert.ok(opts.slice(firstOptional).every((o) => !("required" in o && o.required)), "required options first");
  assert.equal(opts.some((o) => o.name === "category"), budget);
}

// Bank details from the /claim form.
assert.deepEqual(checkBank("Jane Smith", "123 456", "1234-5678", ""), { accountName: "Jane Smith", bsb: "123-456", accountNumber: "12345678", payId: null });
assert.equal(checkBank("Jane", "123-456", "12345678", "jane@example.com").payId, "jane@example.com" as never);
assert.ok("error" in checkBank("", "123456", "12345678", ""), "no name");
assert.ok("error" in checkBank("Jane", "12345", "12345678", ""), "short BSB");
assert.ok("error" in checkBank("Jane", "123456", "123", ""), "short account");
assert.ok("error" in checkBank("Jane", "123456", "12345678901", ""), "long account");
assert.ok("error" in checkBank("Jane", "12a456", "12345678", ""), "letters in the BSB");

console.log("discord: all checks passed");
