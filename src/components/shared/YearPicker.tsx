"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { fieldClasses } from "@/components/ui/input";

/**
 * Picks which year a page shows, via `?year=` so the choice survives a reload and
 * can be shared. Other query params (a search, a status tab) are kept.
 */
export function YearPicker({
  years,
  value,
  label = "Year",
  allLabel,
  className,
}: {
  years: { value: number; label: string }[];
  /** null = "all years", only offered when `allLabel` is given. */
  value: number | null;
  label?: string;
  allLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function pick(v: string) {
    const next = new URLSearchParams(params.toString());
    next.set("year", v);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <label className={cn("inline-flex max-w-full items-center gap-2 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value === null ? "all" : String(value)}
        onChange={(e) => pick(e.target.value)}
        // min-w-0 lets a long option label ("2026 (20 Oct 2025 to …)") shrink on a phone
        // instead of pushing the page sideways.
        className={cn(fieldClasses, "h-9 w-auto min-w-0 flex-1 py-1 pr-8 tabnums")}
      >
        {allLabel && <option value="all">{allLabel}</option>}
        {years.map((y) => (
          <option key={y.value} value={y.value}>
            {y.label}
          </option>
        ))}
      </select>
    </label>
  );
}
