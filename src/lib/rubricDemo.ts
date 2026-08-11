import snapshot from "./rubricDemoSnapshot.json";

// What the Rubric tabs show on the public demo stack (DEMO_MODE=1).
//
// The demo society deliberately has no Rubric credentials — it is served with no
// login, so a working proxy there would let anonymous visitors pull the real
// member and ticket-holder lists. Without a fixture every Rubric tab is an error
// page, so the proxy answers from this file instead and never touches a session.
//
// `capturedAt` is null while the figures are invented. Running
// `npm run rubric:snapshot` against a connected deployment overwrites the file
// with that society's real aggregates (people are replaced with placeholders on
// the way out) and stamps the date. The Rubric tab states which it is showing.
export const DEMO_CAPTURED_AT: string | null = snapshot.capturedAt;

export function demoEnabled(): boolean {
  return process.env.DEMO_MODE === "1";
}

export function demoResponse(type: string): Record<string, unknown> | null {
  const responses = snapshot.responses as Record<string, Record<string, unknown>>;
  return responses[type] ?? null;
}

const FIRST = ["Ava", "Noah", "Mia", "Ethan", "Zoe", "Kai", "Ruby", "Leo", "Ivy", "Finn", "Nora", "Owen"];
const LAST = ["Nguyen", "Patel", "Chen", "Lee", "Singh", "Kim", "Tran", "Wang", "Ali", "Brown", "Garcia", "Ito"];

// Replace every person a Rubric response names, keeping counts, roles and money
// intact. The snapshot is committed and served without a login, so real members
// must not survive the trip. Used by scripts/rubric-snapshot.ts.
//
// `name` is only a person's name when it sits in a person-shaped object: Rubric
// also uses it for a team member's role ({ role: { name: "President" } }) and for
// merch listings, and anonymising those would corrupt the demo rather than
// protect anyone.
export function anonymisePeople(value: unknown, counter = { n: 0 }): unknown {
  if (Array.isArray(value)) return value.map((v) => anonymisePeople(v, counter));
  if (!value || typeof value !== "object") return value;

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).map((k) => k.toLowerCase());
  const isPerson =
    keys.includes("fullname") || keys.includes("accepted") || keys.some((k) => k.includes("email"));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (typeof v === "string" && (key === "fullname" || (key === "name" && isPerson))) {
      const i = ++counter.n;
      out[k] = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    } else if (typeof v === "string" && key.includes("email")) {
      out[k] = `member${++counter.n}@example.com`;
    } else if (typeof v === "string" && (key === "student number" || key === "zid")) {
      out[k] = `z${5000000 + ++counter.n}`;
    } else if (typeof v === "string" && (key === "phone" || key.includes("mobile"))) {
      out[k] = "";
    } else {
      out[k] = anonymisePeople(v, counter);
    }
  }
  return out;
}
