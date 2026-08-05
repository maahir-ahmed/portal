import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

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
    },
  });
}
