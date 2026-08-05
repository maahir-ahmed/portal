import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { getRubricCredentials } from "@/lib/rubric";
import { RUBRIC_CALLS, canCall, scrubResponse } from "@/lib/rubricCalls";
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

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
    await prisma.society.update({
      where: { id: membership!.societyId },
      data: { rubricSessionId: data.rotating_session_ID },
    });
  }

  if (spec.write) {
    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: parsed.data.type === "archiveEvent" ? "DELETE" : "CREATE",
      entityType: "RubricCall",
      entityId: parsed.data.type,
      metadata: { succeeded: data.success !== false },
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
