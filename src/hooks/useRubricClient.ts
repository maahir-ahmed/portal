"use client";

import { useCallback } from "react";

// Rubric calls go through our own server, which holds the session ID and checks each
// call against an allowlist (src/lib/rubricCalls.ts). The browser never receives a
// Rubric credential, so one can no longer be lifted out of network traffic and used
// against Rubric directly.
export function useRubricClient(societySlug: string) {
  const call = useCallback(
    async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const { type, ...params } = payload;

      const res = await fetch(`/api/societies/${societySlug}/rubric/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, params }),
      });

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        // "not_configured" is load-bearing: the pages show a setup prompt on it.
        const message =
          typeof data.error === "string" ? data.error : `Rubric request failed (${res.status})`;
        throw new Error(message);
      }

      return data;
    },
    [societySlug]
  );

  return { call };
}
