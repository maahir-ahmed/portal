import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "./db";
import { CATEGORY_FOR_ROLE, CATEGORY_LABELS, EVIDENCE_LABELS, groupLabel } from "./ahegs";
import { mergeMinutes, type MergeSource } from "./pdfMerge";
import { formatDate } from "./utils";
import type { AhegsCategory, AhegsEvidenceKind } from "@prisma/client";

/** Reads an upload of ours. External links are deliberately not fetched server-side. */
async function readUpload(url: string): Promise<Uint8Array> {
  if (!url.startsWith("/uploads/")) throw new Error("not an upload");
  const name = url.slice("/uploads/".length);
  if (name.includes("..") || name.includes("/")) throw new Error("bad path");
  return new Uint8Array(await readFile(join(process.cwd(), "uploads", name)));
}

export interface BuiltMinutes {
  pdf: Uint8Array;
  pages: number;
  merged: number;
  /** Meetings left out: minutes kept as a link, or a PDF that would not parse. */
  skipped: string[];
  label: string;
}

/**
 * Stitches the minutes of every meeting a category attended into one PDF.
 *
 * Minutes are laid out with the attendance sheet on page 1 and the meeting itself on
 * the pages after it, so one upload answers both of Arc's questions: ATTENDANCE takes
 * the first page of each, COMMITMENT the rest.
 *
 * Shared by the evidence-slot merge (which files the result against the submission)
 * and the plain download (which just hands it over) so the two can never drift into
 * producing different documents.
 */
export async function buildMinutes(
  societyId: string,
  societyName: string,
  year: number,
  category: AhegsCategory,
  kind: Exclude<AhegsEvidenceKind, "TRAINING">
): Promise<BuiltMinutes | null> {
  const [meetings, memberships, entries, portfolios] = await Promise.all([
    prisma.ahegsMeeting.findMany({
      where: { societyId, year, fileUrl: { not: null } },
      include: { attendees: { select: { membershipId: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.societyMembership.findMany({ where: { societyId }, select: { id: true, role: true } }),
    prisma.ahegsEntry.findMany({ where: { societyId, year }, select: { membershipId: true, category: true } }),
    prisma.portfolio.findMany({ where: { societyId }, select: { id: true, name: true } }),
  ]);

  // A meeting is evidence for a category when someone in that category was there,
  // which is what Arc is actually asking to see.
  const override = new Map(entries.map((e) => [e.membershipId, e.category]));
  const categoryOf = new Map(memberships.map((m) => [m.id, override.get(m.id) ?? CATEGORY_FOR_ROLE[m.role]]));
  const relevant = meetings.filter((m) =>
    m.attendees.some((a) => categoryOf.get(a.membershipId) === category)
  );

  const take = kind === "ATTENDANCE" ? "first" : "rest";

  const sources: MergeSource[] = [];
  const unreadable: string[] = [];
  for (const m of relevant) {
    try {
      sources.push({
        title: m.title,
        subtitle: `${groupLabel(m, portfolios)} · ${formatDate(m.date)} · ${m.hours}h · ${m.attendees.length} attended`,
        bytes: await readUpload(m.fileUrl!),
        take,
      });
    } catch {
      // Minutes kept as a link live somewhere we don't fetch from, so they can't be
      // merged — naming them is how the exec knows to attach them by hand.
      unreadable.push(m.title);
    }
  }

  if (sources.length === 0) return null;

  const heading = `${societyName} — ${CATEGORY_LABELS[category]} ${EVIDENCE_LABELS[kind].title.toLowerCase()} ${year}`;
  const { pdf, pages, failed } = await mergeMinutes(heading, sources);

  return {
    pdf,
    pages,
    merged: sources.length - failed.length,
    skipped: [...failed, ...unreadable],
    label: `${CATEGORY_LABELS[category]} ${EVIDENCE_LABELS[kind].title.toLowerCase()} ${year}.pdf`,
  };
}
