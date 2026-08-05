import { randomInt } from "node:crypto";
// The package's export map only publishes the .js subpath, hence the extension.
import { wordlist } from "@scure/bip39/wordlists/english.js";

// Temporary passwords get read out loud or pasted into a Discord message and then
// changed on first login, so being sayable matters more than being short.
//
// The wordlist is BIP39's English list via @scure/bip39. It is a mnemonic library,
// but that list is the best-curated short wordlist going for this purpose: 2048
// common words, no two sharing their first four letters, and no similar-sounding
// pairs — exactly the properties you want when someone reads a passphrase down a
// call. Only the list is used; selection stays here on node's randomInt, which is
// the CSPRNG and rejects modulo bias, so nothing is trusted to the dependency
// beyond the words themselves.
//
// Four words from 2048 is 44 bits. Against bcrypt at cost 12 that is not the weak
// link — the message it was sent in is.

export const PASSPHRASE_WORDS = 4;

export const WORDS: readonly string[] = wordlist;

/** A hyphenated passphrase, e.g. "canyon-oblige-thumb-velvet". */
export function generatePassphrase(words = PASSPHRASE_WORDS): string {
  return Array.from({ length: words }, () => WORDS[randomInt(WORDS.length)]).join("-");
}
