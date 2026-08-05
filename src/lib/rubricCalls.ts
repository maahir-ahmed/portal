import { z } from "zod";
import type { Role } from "@prisma/client";

// The only Rubric API calls this app will make, and who may trigger them.
//
// Nothing here is reachable by name from the client: the proxy route looks the type
// up in this table, rejects anything absent, checks the caller's role, validates the
// parameters against the schema below, and supplies the session ID and society ID
// itself. That is what stops a member from aiming our stored Rubric session at
// destructive endpoints (deleting members, refunding payments) or at a different
// society, both of which a leaked session ID allowed.

export interface RubricCallSpec {
  /** Minimum society role. Reads follow the tab the call belongs to. */
  minRole: Role;
  /** Writes change data on Rubric: executive only, and audit logged. */
  write?: boolean;
  /**
   * Returns personal data about members or ticket holders (names, student emails,
   * zIDs, phone numbers, gender identity). The reported impact of the old design
   * was bulk PII exfiltration, so these reads are audit logged the same as writes.
   */
  pii?: boolean;
  /** Client-supplied parameters. Anything not described here is dropped. */
  params?: z.ZodType<Record<string, unknown>>;
  /** Calls that want the numeric society id under their own key. */
  societyIdKey?: string;
}

const none = z.object({}).strict();
const eventId = z.object({ eventid: z.union([z.string().min(1), z.number()]) }).strict();

// Rubric's affiliation form answers, as built by buildQuestionsPayload.
const formQuestions = z.array(
  z.object({
    questionId: z.union([z.string(), z.number()]),
    responses: z.array(
      z.object({
        optionId: z.union([z.string(), z.number()]),
        value: z.string(),
      })
    ),
  })
);

export const RUBRIC_CALLS: Record<string, RubricCallSpec> = {
  // ── Reads: Events tab, which directors can see ──────────────────────────────
  getSocietyPortalTicketingHomePage: { minRole: "DIRECTOR", params: none },
  getEventDetails: { minRole: "DIRECTOR", params: eventId },
  // Ticket holders' names, kept at DIRECTOR because whoever runs the event needs
  // the door list. Logged, since it is the one PII read below executive.
  getSocietyPortalEventTicketList: { minRole: "DIRECTOR", pii: true, params: eventId },

  // ── Reads: executive-only tabs ─────────────────────────────────────────────
  getSocietyPortalMembershipHomePage: { minRole: "EXECUTIVE", params: none },
  getSocietyPortalMembershipList: {
    minRole: "EXECUTIVE",
    pii: true,
    params: z.object({ viewFilter: z.enum(["active", "expired", "pending"]) }).strict(),
  },
  getSocietyTeamMembers: {
    minRole: "EXECUTIVE",
    pii: true,
    params: z.object({ complete: z.boolean().optional() }).strict(),
  },
  getMerchListings: { minRole: "EXECUTIVE", params: none },
  getMerchOrders: { minRole: "EXECUTIVE", pii: true, params: none },
  getSocietyPortalSettlementList: { minRole: "EXECUTIVE", params: none },
  getSocietyPortalSettlementDetail: {
    minRole: "EXECUTIVE",
    params: z.object({ sid: z.union([z.string().min(1), z.number()]) }).strict(),
  },
  getSocietyEventCreatePage: { minRole: "EXECUTIVE", params: none },

  // ── Writes: executive only ─────────────────────────────────────────────────
  // Archiving used to be reachable by any director through the Events tab. It
  // changes data on Rubric, so it is an executive action now.
  archiveEvent: { minRole: "EXECUTIVE", write: true, params: eventId },
  submitFormResponse: {
    minRole: "EXECUTIVE",
    write: true,
    societyIdKey: "societyid",
    params: z
      .object({
        form_id: z.union([z.string(), z.number()]),
        draft: z.boolean(),
        questions: formQuestions,
        metaFormResponseUUID: z.string().min(1),
      })
      .strict(),
  },
  submitEvent: {
    minRole: "EXECUTIVE",
    write: true,
    params: z
      .object({
        eventName: z.string().min(1),
        description: z.string(),
        eventAddress: z.string(),
        eventStartDate: z.string(),
        eventEndDate: z.string(),
        timezone: z.string(),
        isPrivate: z.boolean(),
        draft: z.boolean(),
        metaFormResponseUUID: z.string().min(1).optional(),
        totalTickets: z.union([z.string(), z.number()]).optional(),
        bannerurl: z.string().optional(),
        facebookURL: z.string().optional(),
      })
      .strict(),
  },
};

const RANK: Record<Role, number> = { EXECUTIVE: 3, DIRECTOR: 2, SUBCOMMITTEE: 1 };

export function canCall(role: Role, spec: RubricCallSpec): boolean {
  return RANK[role] >= RANK[spec.minRole];
}

// Keys that must never travel back to the browser, whatever Rubric puts in a
// response. rotating_session_ID in particular is a fresh credential. Applied at
// every depth, because a response shape we have not seen could nest one.
// Matches sessionid, session_id, sessionID, unionSessionID, rotating_session_ID.
// Deliberately not a bare /session/, which would eat legitimate data such as an
// event's "sessions".
const SECRET_KEYS = /session[_-]?id|rotating_session/i;

export function scrubResponse<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => scrubResponse(v)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEYS.test(key))
        .map(([key, v]) => [key, scrubResponse(v)])
    ) as T;
  }
  return value;
}
