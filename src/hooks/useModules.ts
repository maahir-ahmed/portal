"use client";

import { useEffect, useState } from "react";
import { flagsFrom, type ModuleColumns, type ModuleFlags } from "@/lib/modules";

// The society's feature flags, for client components (sidebar, tour, forms). Null
// until loaded, so callers hide module-owned entries rather than flash them.
// Settings > Features fires MODULES_CHANGED after a save so the sidebar follows
// without a reload.
export const MODULES_CHANGED = "modules:changed";

const cache = new Map<string, ModuleFlags>();

export function useModules(slug: string): ModuleFlags | null {
  const [flags, setFlags] = useState<ModuleFlags | null>(cache.get(slug) ?? null);

  useEffect(() => {
    if (!slug) return;
    let live = true;
    const load = () =>
      fetch(`/api/societies/${slug}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s: ModuleColumns | null) => {
          if (!s || !live) return;
          const f = flagsFrom(s);
          cache.set(slug, f);
          setFlags(f);
        })
        .catch(() => {});
    load();
    window.addEventListener(MODULES_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(MODULES_CHANGED, load);
    };
  }, [slug]);

  return flags;
}
