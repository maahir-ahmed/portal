// Runs each prisma/post-push/*.sql once, after `prisma db push`, in name order.
//
// db push only reconciles structure. Data a schema change needs (a backfill, or
// keeping an existing society's behaviour when a new default would change it) used
// to be a hand-run psql file, and someone hosting their own copy cannot be expected
// to do that. These run themselves on every start and are recorded in
// _applied_fixes, so each one applies exactly once per database. A fresh database
// runs them too, against no rows, which is how a fix can target "stacks that
// existed before this change" without a flag.
//
// Each file runs in its own transaction with its _applied_fixes row, so a failing
// fix leaves nothing half-done and is retried on the next start.
//
// Plain .mjs on `pg` rather than tsx or the Prisma CLI: the runtime image has
// neither, but `pg` ships in the standalone output via the Prisma adapter.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const dir = join(import.meta.dirname, "..", "prisma", "post-push");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const done = new Set((await client.query(`SELECT name FROM "_applied_fixes"`)).rows.map((r) => r.name));
  for (const file of files.filter((f) => !done.has(f))) {
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(join(dir, file), "utf8"));
      await client.query(`INSERT INTO "_applied_fixes" (name) VALUES ($1)`, [file]);
      await client.query("COMMIT");
      console.log(`post-push: applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`post-push: ${file} failed, nothing from it was kept: ${err.message}`);
    }
  }
} finally {
  await client.end();
}
