import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "./db";

// Uploaded files nothing points at any more: a form abandoned after its file went up, or
// a record deleted without its file. Settings > Debugging lists them and deletes only
// what an executive confirms (SOC-BUG-026).

const DIR = join(process.cwd(), "uploads"); // where saveUpload writes and /uploads serves from
// saveUpload's names: a UUID and an extension. Anything else in the folder (a hand-placed
// logo, the tutorial placeholder) is never offered for deletion.
const SAVED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/;
const REFERENCE = /\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+)/g;
// A file this new may belong to a form someone is still filling in.
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export interface OrphanFile {
  name: string;
  bytes: number;
  modifiedAt: string;
}

/**
 * Every upload name mentioned anywhere in the database. Searches every text and JSON
 * column rather than a list of the columns that hold files, so a column added later
 * can't make its files look unused and get them deleted.
 */
async function referencedNames(): Promise<Set<string>> {
  const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND data_type IN ('text', 'character varying', 'json', 'jsonb', 'ARRAY')`;
  const quote = (id: string) => `"${id.replace(/"/g, '""')}"`;
  const names = new Set<string>();
  for (const { table_name, column_name } of columns) {
    // Identifiers come from the catalog, not from a request, and are quoted.
    const rows = await prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT ${quote(column_name)}::text AS v FROM ${quote(table_name)} WHERE ${quote(column_name)}::text LIKE '%/uploads/%'`
    );
    for (const { v } of rows) for (const m of v.matchAll(REFERENCE)) names.add(m[1]);
  }
  return names;
}

/** Uploads no row refers to and older than a day, oldest first. */
export async function findOrphanUploads(): Promise<OrphanFile[]> {
  const files = (await readdir(DIR).catch(() => [] as string[])).filter((n) => SAVED_NAME.test(n));
  if (!files.length) return [];
  const used = await referencedNames();
  const out: OrphanFile[] = [];
  for (const name of files) {
    if (used.has(name)) continue;
    const s = await stat(join(DIR, name)).catch(() => null);
    if (!s?.isFile() || Date.now() - s.mtimeMs < ORPHAN_MIN_AGE_MS) continue;
    out.push({ name, bytes: s.size, modifiedAt: s.mtime.toISOString() });
  }
  return out.sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt));
}

/**
 * Deletes the named files, but only those still unused now: between the listing and
 * the confirm, someone may have attached one. Returns what was actually deleted.
 */
export async function deleteOrphanUploads(names: string[]): Promise<OrphanFile[]> {
  const wanted = new Set(names);
  const still = (await findOrphanUploads()).filter((f) => wanted.has(f.name));
  for (const f of still) await rm(join(DIR, f.name), { force: true });
  return still;
}
