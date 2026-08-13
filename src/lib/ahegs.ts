import type { AhegsCategory, AhegsEvidenceKind, Role } from "@prisma/client";

// Arc's Clubs Contributing Members Recognition, once a year. Arc offers four lists;
// this club submits two. Volunteers doesn't apply, and directors go forward as
// sub-committee rather than as Arc's "mentors" — one list and one set of supporting
// documents instead of two, for people whose contribution is the same shape.
export const AHEGS_CATEGORIES: AhegsCategory[] = ["EXECUTIVE", "SUBCOMMITTEE"];

// The committee's own roles decide the category. MENTOR is still a value the database
// carries (older submissions used it), just not one this club puts forward.
export const CATEGORY_FOR_ROLE: Record<Role, AhegsCategory> = {
  EXECUTIVE: "EXECUTIVE",
  DIRECTOR: "SUBCOMMITTEE",
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
// MENTOR keeps its entry because the enum keeps the value; it is simply not in
// AHEGS_CATEGORIES, so nothing offers it. The blank file stays in public/ — and stays
// checked for last year's committee — in case the club ever splits the list again.
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

// Arc asks for supporting documents behind the sub-committee list only; elected
// executives need no evidence beyond the list itself.
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

// ─── Contributions ───────────────────────────────────────────────────────────
//
// Every meeting is tagged with the group that ran it — a portfolio, the executive
// team, or the whole committee — which is what lets an executive read the pile
// grouped and what stops a director editing another portfolio's half of it.

export interface ContributionGroup {
  portfolioId: string | null;
  execTeam: boolean;
}

export function groupLabel(g: ContributionGroup, portfolios: { id: string; name: string }[]): string {
  if (g.execTeam) return "Executive team";
  if (!g.portfolioId) return "Whole committee";
  return portfolios.find((p) => p.id === g.portfolioId)?.name ?? "Unknown group";
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

const normaliseCategory = (c: AhegsCategory | null | undefined): AhegsCategory | null =>
  !c ? null : AHEGS_CATEGORIES.includes(c) ? c : "SUBCOMMITTEE";

/** A membership as it will appear on the submission, before any exec edits. */
export interface RosterSource {
  membershipId: string;
  role: Role;
  portfolioId: string | null;
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
  hoursAdjustment?: number | null;
}

export interface RosterRow {
  membershipId: string;
  portfolioId: string | null;
  category: AhegsCategory;
  included: boolean;
  fullName: string;
  zid: string;
  email: string;
  position: string;
  startDate: string;
  endDate: string;
  /** Hours credited from meetings attended, and how many meetings that was. */
  meetingHours: number;
  meetingCount: number;
  /** Contribution outside meetings, set by hand. */
  hoursAdjustment: number | null;
  /** meetingHours + hoursAdjustment. */
  totalHours: number;
  /** True where the value came from the exec rather than the member directory. */
  edited: boolean;
}

/** A logged meeting, reduced to what the hours sum needs. */
export interface MeetingAttendance {
  hours: number;
  attendeeIds: string[];
}

// Hours are summed rather than stored, so correcting a meeting's duration or its
// attendee list re-credits everyone automatically and the minutes always match.
export function hoursFromMeetings(membershipId: string, meetings: MeetingAttendance[]) {
  let meetingCount = 0;
  let hours = 0;
  for (const m of meetings) {
    if (m.attendeeIds.includes(membershipId)) {
      meetingCount++;
      hours += m.hours;
    }
  }
  return { meetingCount, meetingHours: Math.round(hours * 100) / 100 };
}

/**
 * What one member looks like on the submission. Everything defaults from the member
 * directory and is overridden only where an exec has corrected it, so the roster
 * keeps following the directory for the rest of the year.
 */
export function resolveRow(
  m: RosterSource,
  o: RosterEntryOverride | undefined,
  year: number,
  meetings: MeetingAttendance[] = []
): RosterRow {
  // Arc wants the period inside the academic year being recognised, so a member who
  // joined in an earlier year starts on 1 January rather than their join date.
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const joined = m.joinedAt > yearStart ? m.joinedAt : yearStart;

  const { meetingCount, meetingHours } = hoursFromMeetings(m.membershipId, meetings);
  const hoursAdjustment = o?.hoursAdjustment ?? null;

  return {
    membershipId: m.membershipId,
    portfolioId: m.portfolioId,
    // A submission edited before directors were folded in still stores MENTOR; it is
    // read as sub-committee rather than dropping those people off every list.
    category: normaliseCategory(o?.category) ?? CATEGORY_FOR_ROLE[m.role],
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
    meetingCount,
    meetingHours,
    hoursAdjustment,
    totalHours: Math.round((meetingHours + (hoursAdjustment ?? 0)) * 100) / 100,
    edited: !!o,
  };
}

// ─── Who sees what ───────────────────────────────────────────────────────────
//
// Executives see and edit the whole club. Directors are scoped to their own
// portfolio — which includes themselves, since a director's membership carries the
// portfolio their title belongs to. Subcommittee members get no access at all, so
// the page and every route under it require DIRECTOR at minimum.

export interface AhegsScope {
  isExec: boolean;
  /** The director's portfolio. Null for an executive (who is not limited to one). */
  portfolioId: string | null;
}

export function ahegsScope(role: Role, portfolioId: string | null): AhegsScope {
  return { isExec: role === "EXECUTIVE", portfolioId: role === "EXECUTIVE" ? null : portfolioId };
}

/**
 * Whether this viewer may see and edit a row. Enforced in the route handlers, not
 * just the UI — a director must not be able to reach another portfolio by id.
 * A director with no portfolio (a title outside the society's list) sees nobody.
 */
export function canTouchPortfolio(scope: AhegsScope, portfolioId: string | null): boolean {
  if (scope.isExec) return true;
  return scope.portfolioId !== null && portfolioId === scope.portfolioId;
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
