import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { CATEGORY_FOR_ROLE, CATEGORY_LABELS, EVIDENCE_LABELS } from "@/lib/ahegs";
import { mergeMinutes, type MergeSource } from "@/lib/pdfMerge";
import { formatDate } from "@/lib/utils";
import { z } from "zod";

// Combines every meeting's minutes for one category into the single file Arc asks
// for, and files it straight into that evidence slot. Executive-only, because the
// evidence slots are: a director collects minutes, an exec assembles the submission.
const schema = z.object({
  year: z.number().int().min(2000).max(2100),
  category: z.enum(["EXECUTIVE", "MENTOR", "SUBCOMMITTEE"]),
  kind: z.enum(["TRAINING", "ATTENDANCE", "COMMITMENT"]),
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

    const [meetings, memberships, entries] = await Promise.all([
      prisma.ahegsMeeting.findMany({
        where: { societyId, year: body.year, fileUrl: { not: null } },
        include: { attendees: { select: { membershipId: true } } },
        orderBy: { date: "asc" },
      }),
      prisma.societyMembership.findMany({ where: { societyId }, select: { id: true, role: true } }),
      prisma.ahegsEntry.findMany({
        where: { societyId, year: body.year },
        select: { membershipId: true, category: true },
      }),
    ]);

    // A meeting is evidence for a category when someone in that category was there,
    // which is what Arc is actually asking to see.
    const override = new Map(entries.map((e) => [e.membershipId, e.category]));
    const categoryOf = new Map(
      memberships.map((m) => [m.id, override.get(m.id) ?? CATEGORY_FOR_ROLE[m.role]])
    );
    const relevant = meetings.filter((m) =>
      m.attendees.some((a) => categoryOf.get(a.membershipId) === body.category)
    );

    // Only our own uploads can be merged; an external link is a URL we deliberately
    // do not fetch server-side.
    const sources: MergeSource[] = [];
    const unreadable: string[] = [];
    for (const m of relevant) {
      if (!m.fileUrl?.startsWith("/uploads/")) {
        unreadable.push(m.title);
        continue;
      }
      try {
        const name = m.fileUrl.slice("/uploads/".length);
        if (name.includes("..") || name.includes("/")) throw new Error("bad path");
        sources.push({
          title: m.title,
          date: formatDate(m.date),
          hours: m.hours,
          attendees: m.attendees.length,
          bytes: new Uint8Array(await readFile(join(process.cwd(), "uploads", name))),
        });
      } catch {
        unreadable.push(m.title);
      }
    }

    if (sources.length === 0) {
      return NextResponse.json(
        { error: "No meeting minutes to combine for this category yet" },
        { status: 400 }
      );
    }

    const heading = `${membership!.society.name} — ${CATEGORY_LABELS[body.category]} ${EVIDENCE_LABELS[body.kind].title.toLowerCase()} ${body.year}`;
    const { pdf, pages, failed } = await mergeMinutes(heading, sources);

    const filename = `${randomUUID()}.pdf`;
    await mkdir(join(process.cwd(), "uploads"), { recursive: true });
    await writeFile(join(process.cwd(), "uploads", filename), pdf);

    const label = `${CATEGORY_LABELS[body.category]} ${EVIDENCE_LABELS[body.kind].title.toLowerCase()} ${body.year}.pdf`;
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
      metadata: { merged: sources.length - failed.length, pages, skipped: failed.length + unreadable.length },
    });

    return NextResponse.json({
      url: `/uploads/${filename}`,
      label,
      pages,
      merged: sources.length - failed.length,
      skipped: [...failed, ...unreadable],
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not combine the minutes" }, { status: 500 });
  }
}
