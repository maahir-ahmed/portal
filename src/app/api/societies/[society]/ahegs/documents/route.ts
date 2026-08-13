import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAhegsAccess } from "@/lib/ahegsServer";
import { canTouchPortfolio } from "@/lib/ahegs";
import { z } from "zod";

// A supporting document a group hands up: training material, an attendance record, a
// schedule, a report. Directors upload for their own portfolio; executives can file
// against any group. The executive assembling the submission merges the pile into the
// single file Arc asks for.
const schema = z.object({
  year: z.number().int().min(2000).max(2100),
  kind: z.enum(["TRAINING", "ATTENDANCE", "COMMITMENT"]),
  title: z.string().min(1).max(300),
  url: z.string().min(1).max(2000),
  fileName: z.string().max(300).nullable().optional(),
  portfolioId: z.string().nullable().optional(),
  execTeam: z.boolean().default(false),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { session, membership, scope, error } = await requireAhegsAccess(society);
  if (error) return error;

  try {
    const body = schema.parse(await req.json());

    // Same rule as a meeting: a director files against their own portfolio and
    // nothing else, an executive picks the group.
    const execTeam = scope.isExec && body.execTeam;
    const portfolioId = execTeam ? null : scope.isExec ? (body.portfolioId ?? null) : scope.portfolioId;
    if (!canTouchPortfolio(scope, portfolioId)) {
      return NextResponse.json({ error: "Not your portfolio" }, { status: 403 });
    }
    if (portfolioId) {
      const exists = await prisma.portfolio.count({ where: { id: portfolioId, societyId: membership.societyId } });
      if (!exists) return NextResponse.json({ error: "Unknown portfolio" }, { status: 400 });
    }

    // Only our own uploads or an http(s) link; anything else (javascript:, data:)
    // would become a clickable link on someone else's screen.
    if (!/^(\/uploads\/|https?:\/\/)/.test(body.url)) {
      return NextResponse.json({ error: "Must be an uploaded file or an http(s) link" }, { status: 400 });
    }

    const doc = await prisma.ahegsDocument.create({
      data: {
        societyId: membership.societyId,
        uploadedById: session.user.id,
        portfolioId,
        execTeam,
        year: body.year,
        kind: body.kind,
        title: body.title,
        url: body.url,
        fileName: body.fileName || null,
      },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
