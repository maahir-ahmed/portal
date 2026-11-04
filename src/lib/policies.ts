// The rules shown on each request form, in two layers. The base policy ships with the
// app and no society can edit it; a society appends its own additions in Settings >
// Policies (PolicyAddition). Wherever a request type's policy is shown, both layers
// are shown together, and one "I agree" covers the lot.
//
// No database import: the forms that show these are client components.

export type PolicyKind = "TREASURY" | "PRINTING" | "ROOM_BOOKING" | "CONTENT";

export const POLICY_KINDS: { kind: PolicyKind; label: string; module?: "printing" | "roomBookings" | "events" }[] = [
  { kind: "TREASURY", label: "Reimbursements" },
  { kind: "PRINTING", label: "Printing", module: "printing" },
  { kind: "ROOM_BOOKING", label: "Room bookings", module: "roomBookings" },
  { kind: "CONTENT", label: "Events & content requests", module: "events" },
];

export const BASE_POLICY: Record<PolicyKind, string[]> = {
  TREASURY: [
    "Alcohol and alcoholic beverages are NOT reimbursable under any circumstances.",
    "Personal transport (Uber, taxi, fuel) is NOT reimbursable unless explicitly pre-approved in writing.",
    "Claims submitted more than 3 weeks after the purchase date may not be reimbursed.",
  ],
  PRINTING: [
    "Requests with less than two full business days' notice may not be processed at all.",
    "Collect from Arc Front Desk, 10AM–4PM on business days. Uncollected prints are disposed of one week after the requested collection date.",
    "Prepare your file print-ready (PDF or Word). We can't trim, cut, or staple; resources for that are at Arc Reception.",
  ],
  ROOM_BOOKING: [
    "Arc requires every room booking to be submitted at least 7 business days before the event, external guests or not.",
  ],
  CONTENT: [],
};

/** A society's free text, one rule per line. */
export function additionLines(text: string | null | undefined): string[] {
  return (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** The policy as shown: the society's additions first, since they say how this
 *  society works (who approves what), then the base rules. */
export function combinedPolicy(kind: PolicyKind, additions: string | null | undefined): string[] {
  return [...additionLines(additions), ...BASE_POLICY[kind]];
}
