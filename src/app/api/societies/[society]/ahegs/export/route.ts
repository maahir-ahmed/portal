import { NextRequest, NextResponse } from "next/server";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { AHEGS_CATEGORIES, CATEGORY_LABELS, TEMPLATES, resolveRow } from "@/lib/ahegs";
import { fillTemplate, type Cell } from "@/lib/xlsx";
import type { AhegsCategory } from "@prisma/client";

// Downloads one category's list as Arc's own .xlsx, filled in and ready to upload.
export async function GET(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const category = req.nextUrl.searchParams.get("category") as AhegsCategory | null;
  const year = Number(req.nextUrl.searchParams.get("year"));
  if (!category || !AHEGS_CATEGORIES.includes(category) || !Number.isInteger(year)) {
    return NextResponse.json({ error: "Unknown category or year" }, { status: 400 });
  }

  const [memberships, entries] = await Promise.all([
    prisma.societyMembership.findMany({
      where: { societyId: membership!.societyId },
      include: { user: { select: { name: true, email: true, zId: true } } },
    }),
    prisma.ahegsEntry.findMany({ where: { societyId: membership!.societyId, year } }),
  ]);

  const overrides = new Map(entries.map((e) => [e.membershipId, e]));
  const rows = memberships
    .map((m) =>
      resolveRow(
        {
          membershipId: m.id,
          role: m.role,
          title: m.title,
          isActive: m.isActive,
          joinedAt: m.joinedAt,
          name: m.user.name,
          email: m.user.email,
          zId: m.user.zId,
        },
        overrides.get(m.id),
        year
      )
    )
    .filter((r) => r.included && r.category === category)
    // Grouped by position so Arc reads one portfolio at a time, as the club's own
    // submissions have always been laid out.
    .sort((a, b) => a.position.localeCompare(b.position) || a.fullName.localeCompare(b.fullName));

  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const cells: Cell[][] = rows.map((r) => {
    const zid = /^\d+$/.test(r.zid) ? Number(r.zid) : r.zid;
    return TEMPLATES[category].hasPosition
      ? [r.fullName, zid, r.email, r.position, day(r.startDate), day(r.endDate)]
      : [r.fullName, zid, r.email, day(r.startDate), day(r.endDate)];
  });

  const file = fillTemplate(join(process.cwd(), "public", TEMPLATES[category].file), cells);

  // Bulk personal data leaving the app (names, zIDs, student emails), so it is
  // logged the same way the Rubric member reads are.
  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "READ",
    entityType: "AhegsExport",
    entityId: `${year}-${category}`,
    metadata: { pii: true, rows: rows.length },
  });

  const name = `${CATEGORY_LABELS[category]} AHEGS ${year}.xlsx`;
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
