import { prisma } from "./db";

/** The app's tables. A table name from a request is only ever used if it is in here,
 *  which is what makes quoting it into SQL safe. */
export async function listTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  return rows.map((r) => r.table_name);
}

// Columns never shown in the viewer, by name: password hashes, 2FA secrets, OAuth and
// session tokens, the Rubric session, Discord webhook URLs and bank details. The
// viewer is for checking data, not for lifting credentials off a live stack.
const SENSITIVE = /password|secret$|token|session_?id|session_?state|webhookurl|bsb|account_?(number|name)/i;

export function isSensitive(table: string, column: string): boolean {
  return table === "Session" || SENSITIVE.test(column);
}

/** A row value as JSON can carry it: bigints and Decimals as strings, bytes as a size. */
export function plain(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Uint8Array) return `<${v.length} bytes>`;
  if (v && typeof v === "object" && "toFixed" in v) return String(v); // Prisma Decimal
  return v;
}

// An uploaded SQL file runs inside one transaction the route owns, so a statement in
// the file that ends it would commit half the file and run the rest outside it.
// Checked with function bodies, strings and comments blanked out first: a DO block's
// own BEGIN ... END is not transaction control.
// A statement starts at a line start or after a semicolon ("UPDATE ...; COMMIT;" on one
// line counts). E'...' strings (backslash escapes) and "quoted identifiers" are blanked
// as wholes, or an escaped quote inside them would throw the pairing off and hide a
// COMMIT further down.
const TRANSACTION_CONTROL =
  /(?:^|;)\s*(BEGIN|COMMIT|ROLLBACK|END|START\s+TRANSACTION|SAVEPOINT|RELEASE|ABORT|PREPARE\s+TRANSACTION)\b/im;
const QUOTED =
  /\$([A-Za-z_]*)\$[\s\S]*?\$\1\$|[Ee]'(?:[^'\\]|\\[\s\S]|'')*'|'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\//g;

/** The first transaction-control statement in a SQL file, if any. */
export function transactionControl(sql: string): { word: string; index: number } | null {
  // Same length, newlines kept, so a match's index is still its place in the file.
  const blanked = sql.replace(QUOTED, (m) => m.replace(/[^\n]/g, " "));
  const m = blanked.match(TRANSACTION_CONTROL);
  return m ? { word: m[1].toUpperCase(), index: m.index! + m[0].length - m[1].length } : null;
}
