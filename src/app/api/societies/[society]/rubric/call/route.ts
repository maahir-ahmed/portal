import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { getRubricCredentials, setRubricSession } from "@/lib/rubric";
import { RUBRIC_CALLS, canCall, scrubResponse } from "@/lib/rubricCalls";
import { demoEnabled, demoResponse } from "@/lib/rubricDemo";
import { z } from "zod";

// Every Rubric API call goes through here. The session ID stays on the server: it is
// read from the database per request, used once, and never included in the response.
// Previously the browser was handed the session ID and called api.hellorubric.com
// itself, which meant any authenticated member could lift it out of network traffic
// and act as the executive who created it, across every society that executive
// belongs to.

const RUBRIC_BASE = "https://api.hellorubric.com";
const TIMEOUT_MS = 20_000;

const bodySchema = z.object({
  type: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

// The allowlist stops a member reaching a call they shouldn't; this stops them
// draining a call they may reach. Loading the Rubric tabs costs a handful of calls,
// so a minute's worth of ordinary use sits well under the cap, while scraping the
// membership or ticket lists hits it immediately.
// ponytail: per-process counter, no store. Correct for the single-container
// deployment and resets on restart; needs a shared store only if this ever runs
// more than one replica. The map is bounded by the number of committee members.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const recentCalls = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (recentCalls.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  recentCalls.set(userId, recent);
  return recent.length > RATE_MAX;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  if (rateLimited(session!.user.id)) {
    return NextResponse.json({ error: "Too many Rubric requests, try again shortly" }, { status: 429 });
  }

  // Rejecting non-JSON keeps HTML form posts (the only cross-site shape that can
  // reach here without a CORS preflight) out, on top of the SameSite session cookie.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Expected application/json" }, { status: 415 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Unknown call types are refused outright: the allowlist is the whole point.
  const spec = RUBRIC_CALLS[parsed.data.type];
  if (!spec) return NextResponse.json({ error: "Unsupported Rubric call" }, { status: 400 });

  if (!canCall(membership!.role, spec)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const callParams = spec.params
    ? spec.params.safeParse(parsed.data.params ?? {})
    : ({ success: true, data: {} } as const);
  if (!callParams.success) {
    return NextResponse.json({ error: "Invalid parameters for this Rubric call" }, { status: 400 });
  }

  // Demo stack: answer from the saved snapshot and return before any credential
  // lookup, so a demo deployment cannot reach Rubric even if a session ID were
  // somehow stored on its society. Writes and drill-downs have no fixture and say
  // so plainly, rather than claiming Rubric is unconfigured.
  if (demoEnabled()) {
    const canned = demoResponse(parsed.data.type);
    return canned
      ? NextResponse.json(scrubResponse(canned))
      : NextResponse.json({ error: "Not available in the demo" }, { status: 400 });
  }

  const creds = await getRubricCredentials(membership!.societyId);
  if (!creds) return NextResponse.json({ error: "not_configured" }, { status: 400 });

  // societyID comes from our database, never from the caller, so a member cannot
  // point our session at another society this executive happens to run.
  const payload: Record<string, unknown> = {
    ...callParams.data,
    type: parsed.data.type,
    sessionid: creds.sessionId,
    societyID: creds.societyId,
    currentUrl: "https://portal.hellorubric.com/",
    device: "web_portal",
    version: 4,
    timestamp: Date.now(),
    ...(creds.unionSessionId ? { unionSessionID: creds.unionSessionId } : {}),
    ...(spec.societyIdKey ? { [spec.societyIdKey]: Number(creds.societyId) } : {}),
  };

  let res: Response;
  try {
    res = await fetch(`${RUBRIC_BASE}/${parsed.data.type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Rubric" }, { status: 504 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Rubric HTTP ${res.status}` }, { status: 502 });
  }

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) return NextResponse.json({ error: "Unreadable Rubric response" }, { status: 502 });

  // Rubric hands back a replacement session on some calls. Persist it here; it must
  // not reach the browser, which is what scrubResponse guarantees below.
  if (typeof data.rotating_session_ID === "string" && data.rotating_session_ID.length > 0) {
    await setRubricSession(membership!.societyId, data.rotating_session_ID);
  }

  // Writes, and reads that return personal data. The impact of the old design was
  // bulk PII exfiltration, so who read what has to be answerable after the fact.
  if (spec.write || spec.pii) {
    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: !spec.write ? "READ" : parsed.data.type === "archiveEvent" ? "DELETE" : "CREATE",
      entityType: "RubricCall",
      entityId: parsed.data.type,
      metadata: { succeeded: data.success !== false, ...(spec.pii ? { pii: true } : {}) },
    });
  }

  if (data.success === false) {
    const message =
      (typeof data.usererror === "string" && data.usererror) ||
      (typeof data.error === "string" && data.error) ||
      "Rubric rejected the request";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json(scrubResponse(data));
}
