"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRubricClient } from "@/hooks/useRubricClient";

type Call = ReturnType<typeof useRubricClient>["call"];

/**
 * The load, error and loading state every Rubric page shares. `fetcher` makes the calls and
 * returns what the page keeps; `deps` are the values it reads (a filter, an id) and a change
 * to any of them loads again. A newer load wins: an older answer arriving late is dropped.
 * `error` is the message, with "not_configured" kept as is for the setup prompt.
 */
export function useRubricQuery<T>(societySlug: string, fetcher: (call: Call) => Promise<T>, deps: unknown[] = []) {
  const { call } = useRubricClient(societySlug);
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify([societySlug, ...deps, nonce]);
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(null);
  const latest = useRef(fetcher);
  useEffect(() => {
    latest.current = fetcher;
  });

  useEffect(() => {
    let stale = false;
    latest
      .current(call)
      .then((data) => ({ data, error: null }))
      .catch((err: unknown) => ({ data: null, error: err instanceof Error ? err.message : String(err) }))
      .then((r) => {
        if (!stale) setResult({ key, ...r });
      });
    return () => {
      stale = true;
    };
  }, [call, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const done = result?.key === key;
  return { data: done ? result.data : null, error: done ? result.error : null, loading: !done, reload };
}
