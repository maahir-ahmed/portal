// Feature modules: the sections a society can switch off in Settings > Features.
// Off hides the section and refuses its API, and nothing is deleted, so switching a
// module back on brings every record back as it was.
//
// This file is the single map from a module to the paths it owns. The proxy uses it
// to refuse requests, and the sidebar and the tour use it to hide entries, so a page
// cannot be hidden in one place and reachable in another. No database import here:
// the sidebar is a client component. The server lookup is in modulesServer.ts.

export type ModuleKey =
  | "events"
  | "roomBookings"
  | "printing"
  | "grants"
  | "ticketing"
  | "board"
  | "ahegs"
  | "budget";

export type ModuleFlags = Record<ModuleKey, boolean>;

export const ALL_ON: ModuleFlags = {
  events: true,
  roomBookings: true,
  printing: true,
  grants: true,
  ticketing: true,
  board: true,
  ahegs: true,
  budget: true,
};

export interface ModuleInfo {
  key: ModuleKey;
  label: string;
  // Page paths after the society prefix, and API paths after /api/societies/[society].
  // Matched as a prefix on a path-segment boundary.
  pages: string[];
  api: string[];
}

export const MODULES: ModuleInfo[] = [
  { key: "events", label: "Events & content requests", pages: ["/requests/content"], api: ["/content-requests", "/events"] },
  { key: "roomBookings", label: "Room bookings", pages: ["/requests/room-booking"], api: ["/room-bookings"] },
  { key: "printing", label: "Printing", pages: ["/requests/printing"], api: ["/printing"] },
  // Arc activity grants: the grant status on each event, the exec queue's countdown and
  // Rubric's grants tab. Grants have no API of their own; the status is a field on the event.
  { key: "grants", label: "Activity grants", pages: ["/rubric/grants"], api: [] },
  {
    key: "ticketing",
    label: "Rubric portal (ticketing)",
    pages: ["/rubric", "/settings/rubric"],
    api: ["/rubric/call", "/rubric/submit-event"],
  },
  { key: "board", label: "Exec to-do board", pages: ["/board"], api: ["/board"] },
  { key: "ahegs", label: "AHEGS", pages: ["/ahegs"], api: ["/ahegs"] },
  // Treasury itself is always on. "Transactions only" mode switches off the budget.
  { key: "budget", label: "Spending budget", pages: ["/budget"], api: ["/budget"] },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

// Most specific first, so /rubric/grants is the grants module, not ticketing.
function owner(path: string, field: "pages" | "api"): ModuleKey | null {
  let best: { key: ModuleKey; len: number } | null = null;
  for (const m of MODULES) {
    for (const prefix of m[field]) {
      if (under(path, prefix) && (!best || prefix.length > best.len)) best = { key: m.key, len: prefix.length };
    }
  }
  return best?.key ?? null;
}

/** The module owning a page, given its path after the society prefix (e.g. "/board"). */
export const moduleForPage = (path: string) => owner(path, "pages");

/** The module owning an API route, given its path after /api/societies/[society]. */
export const moduleForApi = (path: string) => owner(path, "api");

/** Whether a page is reachable with these flags. Pages no module owns always are. */
export function pageEnabled(flags: ModuleFlags, path: string): boolean {
  const key = moduleForPage(path);
  // A grants page also lives under the Rubric portal, so it needs both.
  if (key === "grants") return flags.grants && flags.ticketing;
  return !key || flags[key];
}

/** Whether an API route is reachable, given its path after /api/societies/[society]. */
export function apiEnabled(flags: ModuleFlags, path: string): boolean {
  // Submitting an event to Rubric hangs off the event, but it is a Rubric call.
  if (/^\/content-requests\/[^/]+\/rubric(\/|$)/.test(path) && !flags.ticketing) return false;
  const key = moduleForApi(path);
  return !key || flags[key];
}

/** Columns on Society that hold the flags. treasuryMode stands in for "budget". */
export const MODULE_SELECT = {
  moduleEvents: true,
  moduleRoomBookings: true,
  modulePrinting: true,
  moduleGrants: true,
  moduleTicketing: true,
  moduleBoard: true,
  moduleAhegs: true,
  treasuryMode: true,
} as const;

export interface ModuleColumns {
  moduleEvents: boolean;
  moduleRoomBookings: boolean;
  modulePrinting: boolean;
  moduleGrants: boolean;
  moduleTicketing: boolean;
  moduleBoard: boolean;
  moduleAhegs: boolean;
  treasuryMode: "BUDGET" | "TRANSACTIONS";
}

export function flagsFrom(s: ModuleColumns): ModuleFlags {
  return {
    events: s.moduleEvents,
    roomBookings: s.moduleRoomBookings,
    printing: s.modulePrinting,
    grants: s.moduleGrants,
    ticketing: s.moduleTicketing,
    board: s.moduleBoard,
    ahegs: s.moduleAhegs,
    budget: s.treasuryMode === "BUDGET",
  };
}
