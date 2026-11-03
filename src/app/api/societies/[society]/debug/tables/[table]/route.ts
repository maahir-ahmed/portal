import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDebug } from "@/lib/debugServer";
import { isSensitive, listTables, plain } from "@/lib/debugTables";

const PAGE = 25;

// One page of a table, read-only, with sensitive columns masked.
export async function GET(req: NextRequest, { params }: { params: Promise<{ society: string; table: string }> }) {
  const { society, table } = await params;
  const { error } = await requireDebug(society);
  if (error) return error;

  if (!(await listTables()).includes(table)) {
    return NextResponse.json({ error: "No such table" }, { status: 404 });
  }
  const page = Math.max(0, Number(req.nextUrl.searchParams.get("page")) || 0);

  const columns = (
    await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
      ORDER BY ordinal_position`
  ).map((c) => c.column_name);

  // ctid is the physical row order: stable between pages without assuming an id column.
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM "${table}" ORDER BY ctid LIMIT ${PAGE} OFFSET ${page * PAGE}`
  );
  const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${table}"`);

  return NextResponse.json({
    columns: columns.map((name) => ({ name, masked: isSensitive(table, name) })),
    rows: rows.map((r) =>
      columns.map((c) => (r[c] == null ? null : isSensitive(table, c) ? "••••••" : plain(r[c])))
    ),
    page,
    pageSize: PAGE,
    total: n,
  });
}
