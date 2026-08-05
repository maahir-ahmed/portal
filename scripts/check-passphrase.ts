// Guards the temporary-password generator: a duplicate or a stray uppercase word
// silently costs entropy, and a shrinking list silently costs more.
//   npx tsx scripts/check-passphrase.ts
import assert from "node:assert/strict";
import { WORDS, PASSPHRASE_WORDS, generatePassphrase } from "../src/lib/passphrase";

const dupes = WORDS.filter((w, i) => WORDS.indexOf(w) !== i);
assert.deepEqual([...new Set(dupes)], [], `duplicate words cost entropy: ${[...new Set(dupes)].join(", ")}`);

const malformed = WORDS.filter((w) => !/^[a-z]{3,12}$/.test(w));
assert.deepEqual(malformed, [], `words must be 3-12 lowercase letters: ${malformed.join(", ")}`);

// The comment in passphrase.ts claims ~36 bits. Hold the list to it.
const bits = PASSPHRASE_WORDS * Math.log2(WORDS.length);
assert.ok(WORDS.length >= 512, `wordlist shrank to ${WORDS.length}, below the 512 the entropy claim assumes`);
assert.ok(bits >= 36, `passphrase entropy fell to ${bits.toFixed(1)} bits`);

// Generation: right shape, and actually random (a broken RNG returning a constant
// is the failure that would otherwise pass every other check here).
const sample = Array.from({ length: 200 }, () => generatePassphrase());
for (const phrase of sample) {
  const parts = phrase.split("-");
  assert.equal(parts.length, PASSPHRASE_WORDS, `wrong word count: ${phrase}`);
  assert.ok(parts.every((p) => WORDS.includes(p)), `word outside the list: ${phrase}`);
}
assert.ok(new Set(sample).size > 190, "generatePassphrase is repeating itself far too often");
assert.ok(
  new Set(sample.flatMap((p) => p.split("-"))).size > 100,
  "generatePassphrase is drawing from a suspiciously narrow slice of the list"
);

console.log(
  `✅ passphrase: ${WORDS.length} words, ${PASSPHRASE_WORDS} per phrase, ${bits.toFixed(1)} bits ` +
    `(e.g. ${generatePassphrase()})`
);
