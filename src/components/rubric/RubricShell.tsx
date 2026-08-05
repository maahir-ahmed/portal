"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { ExternalLink, Settings } from "lucide-react";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/events", label: "Events" },
  { href: "/members", label: "Members" },
  { href: "/merch", label: "Merch & Orders" },
  { href: "/grants", label: "Grants" },
  { href: "/settlements", label: "Settlements" },
  { href: "/web", label: "Web Portal" },
];

interface RubricShellProps {
  children: React.ReactNode;
}

export function RubricShell({ children }: RubricShellProps) {
  const pathname = usePathname();
  const params = useParams<{ society: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const base = `/${params.society}/rubric`;

  const role = (session?.user as { memberships?: { society: { slug: string }; role: string }[] } | undefined)
    ?.memberships?.find((m) => m.society.slug === params.society)?.role;
  const isExec = role === "EXECUTIVE";

  // Directors are limited to the Events tab; bounce them off any other rubric page.
  useEffect(() => {
    if (role && role !== "EXECUTIVE" && !pathname.startsWith(`${base}/events`)) {
      router.replace(`${base}/events`);
    }
  }, [role, pathname, base, router]);

  const tabs = isExec ? TABS : TABS.filter((t) => t.href === "/events");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Rubric Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connected to your society on{" "}
            <a href="https://hellorubric.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
              hellorubric.com <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
        {isExec && (
          <Link
            href={`/${params.society}/settings`}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" /> Configure
          </Link>
        )}
      </div>

      {/* Tab bar */}
      <div data-tour="rubric-tabs" className="border-b flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const href = `${base}${tab.href}`;
          const active = tab.href === ""
            ? pathname === base || pathname === `${base}/`
            : pathname.startsWith(href);
          return (
            <Link
              key={tab.href}
              href={href}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
