import type { AhegsCategory, AhegsEvidenceKind, Role } from "@prisma/client";

// Arc's Clubs Contributing Members Recognition, once a year. Arc has a fourth
// category (Volunteers) that this club doesn't submit for, so it isn't modelled.
export const AHEGS_CATEGORIES: AhegsCategory[] = ["EXECUTIVE", "MENTOR", "SUBCOMMITTEE"];

// The committee's own roles decide the category: the club's directors are the people
// Arc calls mentors, and everyone else contributing is sub-committee.
export const CATEGORY_FOR_ROLE: Record<Role, AhegsCategory> = {
  EXECUTIVE: "EXECUTIVE",
  DIRECTOR: "MENTOR",
  SUBCOMMITTEE: "SUBCOMMITTEE",
};

export const CATEGORY_LABELS: Record<AhegsCategory, string> = {
  EXECUTIVE: "Executives",
  MENTOR: "Mentors",
  SUBCOMMITTEE: "Sub-Committee",
};

// Arc's blank templates, served from public/. The column order here IS the column
// order of the spreadsheet — the export writes cells positionally, and Arc rejects
// lists that don't match its template.
export const TEMPLATES: Record<
  AhegsCategory,
  { file: string; headings: string[]; hasPosition: boolean }
> = {
  EXECUTIVE: {
    file: "Executive AHEGS Information Template_1.xlsx",
    headings: ["Full name", "zID", "Email", "Executive position", "Date elected", "Period end"],
    hasPosition: true,
  },
  MENTOR: {
    file: "Mentors AHEGS Information Template_1.xlsx",
    headings: ["Full name", "zID", "Email", "Mentoring start", "Mentoring end"],
    hasPosition: false,
  },
  SUBCOMMITTEE: {
    file: "Sub-Committee AHEGS Information Template_1.xlsx",
    headings: ["Full name", "zID", "Email", "Sub-committee position", "Start date", "End date"],
    hasPosition: true,
  },
};

// Arc asks for supporting documents behind the mentor and sub-committee lists only;
// elected executives need no evidence beyond the list itself.
export const EVIDENCE_REQUIRED: Record<AhegsCategory, AhegsEvidenceKind[]> = {
  EXECUTIVE: [],
  MENTOR: ["TRAINING", "ATTENDANCE", "COMMITMENT"],
  SUBCOMMITTEE: ["TRAINING", "ATTENDANCE", "COMMITMENT"],
};

export const EVIDENCE_LABELS: Record<AhegsEvidenceKind, { title: string; hint: string }> = {
  TRAINING: {
    title: "Training resources",
    hint: "What training this group receives. A link to an online file is fine.",
  },
  ATTENDANCE: {
    title: "Attendance lists and records",
    hint: "Internal meetings, events, scheduled sessions. One combined file.",
  },
  COMMITMENT: {
    title: "Proof of commitment",
    hint: "Schedules, meeting notes, reports, reviews, submitted work. One combined file.",
  },
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A membership as it will appear on the submission, before any exec edits. */
export interface RosterSource {
  membershipId: string;
  role: Role;
  title: string | null;
  isActive: boolean;
  joinedAt: Date;
  name: string;
  email: string;
  zId: string | null;
}

export interface RosterEntryOverride {
  category?: AhegsCategory | null;
  included?: boolean;
  fullName?: string | null;
  zid?: string | null;
  email?: string | null;
  position?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface RosterRow {
  membershipId: string;
  category: AhegsCategory;
  included: boolean;
  fullName: string;
  zid: string;
  email: string;
  position: string;
  startDate: string;
  endDate: string;
  /** True where the value came from the exec rather than the member directory. */
  edited: boolean;
}

/**
 * What one member looks like on the submission. Everything defaults from the member
 * directory and is overridden only where an exec has corrected it, so the roster
 * keeps following the directory for the rest of the year.
 */
export function resolveRow(m: RosterSource, o: RosterEntryOverride | undefined, year: number): RosterRow {
  // Arc wants the period inside the academic year being recognised, so a member who
  // joined in an earlier year starts on 1 January rather than their join date.
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const joined = m.joinedAt > yearStart ? m.joinedAt : yearStart;

  return {
    membershipId: m.membershipId,
    category: o?.category ?? CATEGORY_FOR_ROLE[m.role],
    // Someone whose membership has been deactivated is off the list by default, but
    // they may well have contributed for half the year — hence the toggle.
    included: o?.included ?? m.isActive,
    fullName: o?.fullName ?? m.name,
    // The templates ask for the zID without its leading z.
    zid: o?.zid ?? (m.zId ?? "").replace(/^z/i, ""),
    email: o?.email ?? m.email,
    position: o?.position ?? m.title ?? "",
    startDate: iso(o?.startDate ?? joined),
    endDate: iso(o?.endDate ?? yearEnd),
    edited: !!o,
  };
}

// Arc's own spreadsheet refuses a zID outside this range ("A valid zID must be
// entered"), so catch it here rather than letting the upload bounce.
const ZID_MIN = 3_000_000;
const ZID_MAX = 6_000_000;

/** Rows that would be rejected by Arc: it matches people on name and zID. */
export function rowProblems(row: RosterRow): string[] {
  const problems: string[] = [];
  if (!row.fullName.trim()) problems.push("no name");
  if (!/^\d{7}$/.test(row.zid)) problems.push("zID must be 7 digits, without the z");
  else if (Number(row.zid) < ZID_MIN || Number(row.zid) > ZID_MAX) problems.push("zID outside the range Arc accepts");
  if (!row.email.includes("@")) problems.push("no email");
  if (TEMPLATES[row.category].hasPosition && !row.position.trim()) problems.push("no position");
  if (row.endDate < row.startDate) problems.push("ends before it starts");
  return problems;
}
