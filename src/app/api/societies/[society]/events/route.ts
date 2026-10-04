import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { subMonths } from "date-fns";

// The events a reimbursement claim can be linked to. Any member may link their own
// claim to any event, and event pages are open to every member, so this is not
// filtered by submitter. Drafts and cancelled events can't have real spending; the
// 13-month window keeps last year's same-named event pickable without listing
// every event the society has ever run.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  try {
    const events = await prisma.contentRequest.findMany({
      where: {
        societyId: membership!.societyId,
        status: { notIn: ["DRAFT", "CANCELLED"] },
        startDate: { gte: subMonths(new Date(), 13) },
      },
      select: { id: true, eventName: true, startDate: true },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json(events);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
