// Guards the temporary-password generator. The wordlist now comes from
// @scure/bip39, so these assert the properties we depend on still hold after an
// upgrade — the right size, still English, still unique — plus that our own
// selection is actually random.
//   npx tsx scripts/check-passphrase.ts
import assert from "node:assert/strict";
import { WORDS, PASSPHRASE_WORDS, generatePassphrase } from "../src/lib/passphrase";

// BIP39 English is 2048 words. A different number means the import moved to
// another wordlist, or the package changed under us; either way the entropy
// claimed in passphrase.ts no longer holds.
assert.equal(WORDS.length, 2048, `expected the 2048-word BIP39 English list, got ${WORDS.length}`);

// Catches importing japanese.js / simplified-chinese.js by mistake: those are
// valid BIP39 lists and would otherwise pass every check here.
const nonAscii = WORDS.filter((w) => !/^[a-z]{3,8}$/.test(w));
assert.deepEqual(nonAscii, [], `not the English wordlist: ${nonAscii.slice(0, 5).join(", ")}`);

const dupes = [...new Set(WORDS.filter((w, i) => WORDS.indexOf(w) !== i))];
assert.deepEqual(dupes, [], `duplicate words cost entropy: ${dupes.join(", ")}`);

const bits = PASSPHRASE_WORDS * Math.log2(WORDS.length);
assert.ok(bits >= 44, `passphrase entropy fell to ${bits.toFixed(1)} bits`);

// Generation: right shape, and actually random. A broken RNG returning a constant
// is the failure that would otherwise pass every other check here.
const sample = Array.from({ length: 200 }, () => generatePassphrase());
for (const phrase of sample) {
  const parts = phrase.split("-");
  assert.equal(parts.length, PASSPHRASE_WORDS, `wrong word count: ${phrase}`);
  assert.ok(parts.every((p) => WORDS.includes(p)), `word outside the list: ${phrase}`);
}
assert.equal(new Set(sample).size, sample.length, "generatePassphrase repeated a phrase in 200 draws");
assert.ok(
  new Set(sample.flatMap((p) => p.split("-"))).size > 500,
  "generatePassphrase is drawing from a suspiciously narrow slice of the list"
);

console.log(
  `✅ passphrase: ${WORDS.length} words (BIP39 English), ${PASSPHRASE_WORDS} per phrase, ` +
    `${bits.toFixed(1)} bits (e.g. ${generatePassphrase()})`
);
