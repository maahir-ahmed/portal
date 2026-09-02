import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { buildMinutes } from "@/lib/ahegsMinutes";
import { z } from "zod";

// Combines the minutes of every meeting into the single file Arc asks for, and files
// it straight into that evidence slot. Executive-only, because the evidence slots
// are: a group logs its meetings, an executive assembles the submission.
//
// Training resources are the third slot and are not built from meetings — they are
// uploaded or linked by hand — so only these two can be merged.
const schema = z.object({
  year: z.number().int().min(2000).max(2100),
  category: z.enum(["EXECUTIVE", "MENTOR", "SUBCOMMITTEE"]),
  kind: z.enum(["ATTENDANCE", "COMMITMENT"]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());
    const societyId = membership!.societyId;

    const built = await buildMinutes(societyId, membership!.society.name, body.year, body.category, body.kind);
    if (!built) {
      return NextResponse.json(
        { error: "No meeting minutes to combine for this category yet" },
        { status: 400 }
      );
    }
    const { pdf, pages, merged, skipped, label } = built;

    const filename = `${randomUUID()}.pdf`;
    await mkdir(join(process.cwd(), "uploads"), { recursive: true });
    await writeFile(join(process.cwd(), "uploads", filename), pdf);

    await prisma.ahegsEvidence.upsert({
      where: {
        societyId_year_category_kind: {
          societyId,
          year: body.year,
          category: body.category,
          kind: body.kind,
        },
      },
      create: { societyId, year: body.year, category: body.category, kind: body.kind, url: `/uploads/${filename}`, label },
      update: { url: `/uploads/${filename}`, label },
    });

    await createAuditLog({
      societyId,
      userId: session!.user.id,
      action: "CREATE",
      entityType: "AhegsEvidence",
      entityId: `${body.year}-${body.category}-${body.kind}`,
      metadata: { merged, pages, skipped: skipped.length },
    });

    return NextResponse.json({
      url: `/uploads/${filename}`,
      label,
      pages,
      merged,
      skipped,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not combine the minutes" }, { status: 500 });
  }
}
