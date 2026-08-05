import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encryption at rest for the one third-party credential this app stores: the Rubric
// session ID. Kept free of any database import so it stays a pure function that
// scripts/check-rubric.ts can round-trip without a running Postgres.

const PREFIX = "v1.";
let warnedNoKey = false;

// ponytail: AES-256-GCM with a key from the environment, no KMS. This protects a
// pg_dump that leaves the box (deploy/backup.sh keeps 14 days of them) — it does
// NOT protect against host compromise, because the key sits in deploy/.env.prod on
// the same machine. Move RUBRIC_SECRET_KEY off-box if that threat matters.
function secretKey(): Buffer | null {
  const raw = process.env.RUBRIC_SECRET_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("RUBRIC_SECRET_KEY must be 32 bytes base64 (openssl rand -base64 32)");
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const key = secretKey();
  if (!key) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn("RUBRIC_SECRET_KEY unset: the Rubric session is stored in plain text.");
    }
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(stored: string): string {
  // Values written before a key was configured stay readable, and upgrade to
  // ciphertext the next time the session is saved or rotates.
  if (!stored.startsWith(PREFIX)) return stored;
  const key = secretKey();
  if (!key) throw new Error("RUBRIC_SECRET_KEY is unset but the stored Rubric session is encrypted");
  const [iv, tag, ciphertext] = stored
    .slice(PREFIX.length)
    .split(".")
    .map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
