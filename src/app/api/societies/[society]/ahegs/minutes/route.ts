import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { AHEGS_CATEGORIES } from "@/lib/ahegs";
import { buildMinutes } from "@/lib/ahegsMinutes";
import type { AhegsCategory } from "@prisma/client";

// Hands over the combined minutes (or the attendance sheets pulled off their first
// pages) as a download, for either category, without touching the Arc evidence slots.
// The slot merge in ../merge is for assembling a submission; this is for the committee
// wanting its own year of minutes in one file — which for executives, who need no Arc
// evidence at all, was otherwise unreachable.
//
// Executive-only, like the list export next to it: minutes name who attended what.
export async function GET(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const category = req.nextUrl.searchParams.get("category") as AhegsCategory | null;
  const kind = req.nextUrl.searchParams.get("kind");
  const year = Number(req.nextUrl.searchParams.get("year"));
  if (!category || !AHEGS_CATEGORIES.includes(category) || !Number.isInteger(year)) {
    return NextResponse.json({ error: "Unknown category or year" }, { status: 400 });
  }
  if (kind !== "ATTENDANCE" && kind !== "COMMITMENT") {
    return NextResponse.json({ error: "Unknown document" }, { status: 400 });
  }

  let built;
  try {
    built = await buildMinutes(membership!.societyId, membership!.society.name, year, category, kind);
  } catch {
    return NextResponse.json({ error: "Could not combine the minutes" }, { status: 500 });
  }
  if (!built) {
    return NextResponse.json({ error: "No meeting minutes to combine for this category yet" }, { status: 404 });
  }

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "READ",
    entityType: "AhegsMinutes",
    entityId: `${year}-${category}-${kind}`,
    metadata: { merged: built.merged, pages: built.pages, skipped: built.skipped.length },
  });

  return new NextResponse(built.pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${built.label}"`,
      // Rebuilt from the meetings on every request, so a stale copy would be wrong.
      "Cache-Control": "no-store",
      // The buttons are plain links, so the skipped meetings can't be toasted —
      // an exec who wonders what is missing can read it off the response.
      "X-Minutes-Merged": String(built.merged),
      "X-Minutes-Skipped": String(built.skipped.length),
    },
  });
}
