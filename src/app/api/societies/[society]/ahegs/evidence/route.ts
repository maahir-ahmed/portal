import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { z } from "zod";

// Training resources / attendance records / proof of commitment, one per category
// per year. `url` is either an /uploads/… path from the upload route or a link to a
// file elsewhere — Arc accepts both for training resources.
const schema = z.object({
  year: z.number().int().min(2000).max(2100),
  category: z.enum(["EXECUTIVE", "MENTOR", "SUBCOMMITTEE"]),
  kind: z.enum(["TRAINING", "ATTENDANCE", "COMMITMENT"]),
  url: z.string().max(2000).nullable(),
  label: z.string().max(300).nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());
    const key = {
      societyId_year_category_kind: {
        societyId: membership!.societyId,
        year: body.year,
        category: body.category,
        kind: body.kind,
      },
    };

    // A null url clears the slot, which is how a wrong file gets replaced.
    if (!body.url) {
      await prisma.ahegsEvidence.deleteMany({
        where: { societyId: membership!.societyId, year: body.year, category: body.category, kind: body.kind },
      });
      return NextResponse.json({ ok: true });
    }

    // Only our own uploads or an http(s) link; anything else (javascript:, data:)
    // would become a clickable link in the exec UI.
    if (!/^(\/uploads\/|https?:\/\/)/.test(body.url)) {
      return NextResponse.json({ error: "Must be an uploaded file or an http(s) link" }, { status: 400 });
    }

    await prisma.ahegsEvidence.upsert({
      where: key,
      create: {
        societyId: membership!.societyId,
        year: body.year,
        category: body.category,
        kind: body.kind,
        url: body.url,
        label: body.label || null,
      },
      update: { url: body.url, label: body.label || null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
