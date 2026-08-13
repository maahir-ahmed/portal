import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAhegsAccess } from "@/lib/ahegsServer";
import { canTouchPortfolio } from "@/lib/ahegs";

// Removing a contribution takes it out of the next merge; the combined file already
// built keeps whatever it was built from until it is rebuilt.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ society: string; id: string }> }) {
  const { society, id } = await params;
  const { membership, scope, error } = await requireAhegsAccess(society);
  if (error) return error;

  const doc = await prisma.ahegsDocument.findFirst({ where: { id, societyId: membership.societyId } });
  if (!doc || !canTouchPortfolio(scope, doc.portfolioId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.ahegsDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
