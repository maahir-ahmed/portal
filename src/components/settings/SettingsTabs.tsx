"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SettingsTab {
  href: string;
  label: string;
  danger?: boolean;
}

// Wraps rather than scrolling sideways, so every tab stays visible at 320px.
export function SettingsTabs({ prefix, tabs }: { prefix: string; tabs: SettingsTab[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1.5 border-b pb-3">
      {tabs.map((t) => {
        const href = `${prefix}${t.href}`;
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={t.href}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              t.danger && !active && "text-red-700 hover:bg-red-50 hover:text-red-800",
              t.danger && active && "bg-red-700 text-white"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
