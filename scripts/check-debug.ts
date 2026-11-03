// Guards Settings > Debugging's two safety rules that live in code rather than in the
// database: which columns the viewer hides, and which SQL files it refuses to run.
import assert from "node:assert/strict";
import { isSensitive, transactionControl } from "../src/lib/debugTables";

// Credentials and bank details never reach the viewer.
for (const [t, c] of [
  ["User", "passwordHash"], ["User", "twoFactorSecret"],
  ["Society", "rubricSessionId"], ["Society", "rubricUnionSessionId"],
  ["Society", "discordWebhookUrl"], ["Society", "eventsWebhookUrl"],
  ["Account", "access_token"], ["Account", "refresh_token"], ["Account", "id_token"], ["Account", "session_state"],
  ["Session", "sessionToken"], ["Session", "userId"], ["VerificationToken", "token"],
  ["BankAccount", "bsb"], ["BankAccount", "accountNumber"], ["BankAccount", "accountName"],
]) assert.equal(isSensitive(t, c), true, `${t}.${c} must be masked`);

// …without hiding the ordinary columns that merely look similar.
for (const [t, c] of [["Society", "secretarialTier"], ["Society", "eventsWebhookRoleId"], ["User", "email"], ["Society", "name"]]) {
  assert.equal(isSensitive(t, c), false, `${t}.${c} should be readable`);
}

// A file that ends the route's transaction is refused, with the right line.
const line = (sql: string) => {
  const c = transactionControl(sql);
  return c && `${c.word}@${sql.slice(0, c.index).split("\n").length}`;
};
assert.equal(line("UPDATE x SET y = 1;\nCOMMIT;"), "COMMIT@2");
assert.equal(line("begin;\nupdate x set y = 1;"), "BEGIN@1");
assert.equal(line("\n\n  ROLLBACK;"), "ROLLBACK@3");
// A PL/pgSQL block's BEGIN/END, and the words inside strings and comments, are not.
assert.equal(line("DO $$\nBEGIN\n  UPDATE x SET y = 1;\nEND $$;"), null);
assert.equal(line("DO $fix$ BEGIN PERFORM 1; END $fix$;"), null);
assert.equal(line("UPDATE x SET note = 'COMMIT';\n-- COMMIT later\n/* ROLLBACK */ SELECT 1;"), null);
// Ways around the guard that the audit found (docs/audit/AUDIT_REPORT.md, F56).
assert.equal(line("UPDATE a SET b = 1; COMMIT; DELETE FROM a;"), "COMMIT@1", "a COMMIT after a semicolon on the same line");
assert.equal(line("UPDATE a SET b = E'it\\'s';\nCOMMIT;"), "COMMIT@2", "an E'' string with an escaped quote must not hide what follows");
assert.equal(line('UPDATE "it\'s" SET b = 1;\nCOMMIT;'), "COMMIT@2", "a quoted identifier with a quote in it must not hide what follows");
assert.equal(line("PREPARE TRANSACTION 'x';"), "PREPARE TRANSACTION@1");
assert.equal(line("UPDATE a SET note = 'x; COMMIT';"), null, "a semicolon inside a string is not a statement boundary");

console.log("✅ debugging tab: sensitive columns masked, transaction control refused");
