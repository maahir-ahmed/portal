"use client";

import { useEffect, useState } from "react";
import { BASE_POLICY, combinedPolicy, type PolicyKind } from "@/lib/policies";

// One fetch per society per page load, shared by every form that shows a policy.
const additions = new Map<string, Promise<Record<string, string>>>();

/** The policy lines for a request type: the society's additions, then the base rules.
 *  Starts as the base rules alone and fills in the additions once they load. */
export function usePolicy(slug: string, kind: PolicyKind): string[] {
  const [lines, setLines] = useState<string[]>(BASE_POLICY[kind]);

  useEffect(() => {
    let live = true;
    if (!additions.has(slug)) {
      additions.set(
        slug,
        fetch(`/api/societies/${slug}/policies`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
      );
    }
    additions.get(slug)!.then((a) => live && setLines(combinedPolicy(kind, a[kind])));
    return () => {
      live = false;
    };
  }, [slug, kind]);

  return lines;
}
