import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { tierForMembers } from "@/lib/printing";
import { demoEnabled, demoResponse } from "@/lib/rubricDemo";

// The Rubric session ID is a bearer credential for a third-party system: it is
// person-scoped (it reaches every society its owner runs), lives for about a month,
// and the whole Rubric API is one endpoint, so holding it means holding every call
// including member deletion and refunds. It is written and read only here.

// Rubric sessions expire after roughly a month. Surfaced in Settings so a session
// gets replaced deliberately rather than discovered stale mid-event.
export const SESSION_MAX_AGE_DAYS = 30;

export interface RubricCredentials {
  sessionId: string;
  societyId: string;
  unionSessionId?: string | null;
}

export async function getRubricCredentials(societyId: string): Promise<RubricCredentials | null> {
  const society = await prisma.society.findUnique({
    where: { id: societyId },
    select: { rubricSessionId: true, rubricSocietyId: true, rubricUnionSessionId: true },
  });
  if (!society?.rubricSessionId || !society?.rubricSocietyId) return null;
  return {
    sessionId: decryptSecret(society.rubricSessionId),
    societyId: society.rubricSocietyId,
    unionSessionId: society.rubricUnionSessionId ? decryptSecret(society.rubricUnionSessionId) : null,
  };
}

// The only write path for the session, so it cannot be stored unencrypted or
// without a timestamp by accident. `null` disconnects the integration.
export async function setRubricSession(societyId: string, sessionId: string | null) {
  await prisma.society.update({
    where: { id: societyId },
    data: {
      rubricSessionId: sessionId === null ? null : encryptSecret(sessionId),
      rubricSessionUpdatedAt: sessionId === null ? null : new Date(),
      // A disconnected society's count goes stale, so its tier is set by hand again.
      ...(sessionId === null ? { arcMemberCount: null, arcMemberCountAt: null } : {}),
    },
  });
}

const RUBRIC_BASE = "https://api.hellorubric.com";

/**
 * One Rubric API call with the society's stored session. The only place that talks to
 * Rubric: the proxy route (after its allowlist and role checks) and refreshArcTier.
 * Persists the replacement session Rubric sometimes hands back. Throws if Rubric
 * can't be reached; `data` is null when the reply isn't JSON.
 */
export async function postRubric(
  societyId: string,
  creds: RubricCredentials,
  type: string,
  params: Record<string, unknown>,
  { societyIdKey, timeoutMs = 20_000 }: { societyIdKey?: string; timeoutMs?: number } = {}
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  // societyID comes from our database, never from the caller, so a member cannot
  // point our session at another society this executive happens to run.
  const payload: Record<string, unknown> = {
    ...params,
    type,
    sessionid: creds.sessionId,
    societyID: creds.societyId,
    currentUrl: "https://portal.hellorubric.com/",
    device: "web_portal",
    version: 4,
    timestamp: Date.now(),
    ...(creds.unionSessionId ? { unionSessionID: creds.unionSessionId } : {}),
    ...(societyIdKey ? { [societyIdKey]: Number(creds.societyId) } : {}),
  };
  const res = await fetch(`${RUBRIC_BASE}/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return { ok: false, status: res.status, data: null };
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof data?.rotating_session_ID === "string" && data.rotating_session_ID.length > 0) {
    await setRubricSession(societyId, data.rotating_session_ID);
  }
  return { ok: true, status: res.status, data };
}

const TIER_MAX_AGE_MS = 86_400_000;

/**
 * Sets the society's Arc club tier (and so its secretarial allowance) from its active
 * member count on Rubric, at most once a day unless forced. Does nothing without
 * Rubric, and keeps the last tier if Rubric doesn't answer.
 */
export async function refreshArcTier(societyId: string, force = false): Promise<void> {
  try {
    const soc = await prisma.society.findUnique({ where: { id: societyId }, select: { arcMemberCountAt: true } });
    if (!force && soc?.arcMemberCountAt && Date.now() - soc.arcMemberCountAt.getTime() < TIER_MAX_AGE_MS) return;

    let count: unknown;
    if (demoEnabled()) {
      count = demoResponse("getSocietyPortalMembershipHomePage")?.activeMemberships;
    } else {
      const creds = await getRubricCredentials(societyId);
      if (!creds) return;
      // Short timeout: this runs while the Printing page loads.
      const r = await postRubric(societyId, creds, "getSocietyPortalMembershipHomePage", {}, { timeoutMs: 5_000 });
      if (r.data?.success === false) return;
      count = r.data?.activeMemberships;
    }
    if (typeof count !== "number" || !Number.isFinite(count)) return;

    await prisma.society.update({
      where: { id: societyId },
      data: { arcMemberCount: count, arcMemberCountAt: new Date(), secretarialTier: tierForMembers(count) },
    });
  } catch (err) {
    console.warn("Arc tier refresh failed:", err instanceof Error ? err.message : err);
  }
}
