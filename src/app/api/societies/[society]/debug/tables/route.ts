import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDebug } from "@/lib/debugServer";
import { listTables } from "@/lib/debugTables";

// Every table with its exact row count. Exact rather than the planner's estimate:
// someone checking that a restore or a SQL run did what they meant needs real numbers.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { error } = await requireDebug(society);
  if (error) return error;

  const tables = await listTables();
  const counts = await Promise.all(
    tables.map(async (t) => {
      const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t}"`);
      return { name: t, rows: n };
    })
  );
  return NextResponse.json(counts);
}
