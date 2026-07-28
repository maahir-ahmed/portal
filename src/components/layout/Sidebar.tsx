"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Building2,
  Wallet,
  Printer,
  Users,
  Settings,
  Shield,
  LogOut,
  Globe2,
  UserCog,
  PiggyBank,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { SessionUser } from "@/types";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/requests/content",
    label: "Content Requests / Events",
    icon: FileText,
  },
  {
    href: "/requests/room-booking",
    label: "Room Bookings",
    icon: Building2,
  },
  {
    href: "/requests/treasury",
    label: "Treasury",
    icon: Wallet,
  },
  {
    href: "/requests/printing",
    label: "Printing",
    icon: Printer,
  },
  {
    href: "/budget",
    label: "Spending Budget",
    icon: PiggyBank,
    // Visible to all members (view-only); edits + claim list are exec-only in the page.
  },
  {
    href: "/executive/queue",
    label: "Exec Queue",
    icon: Shield,
    minRole: "EXECUTIVE" as const,
  },
  {
    href: "/members",
    label: "Members",
    icon: Users,
    minRole: "EXECUTIVE" as const,
  },
  {
    href: "/rubric",
    label: "Rubric Portal",
    icon: Globe2,
    minRole: "DIRECTOR" as const, // exec + director (directors see the Events tab only)
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    minRole: "EXECUTIVE" as const,
  },
  {
    href: "/account",
    label: "My Account",
    icon: UserCog,
  },
];

const ROLE_RANK: Record<string, number> = { EXECUTIVE: 3, DIRECTOR: 2, SUBCOMMITTEE: 1 };

interface SidebarProps {
  user: SessionUser;
  societyName: string;
  societySlug: string;
  userRole: string;
  primaryColor?: string;
  societyLogo?: string | null;
}

export function Sidebar({ user, societyName, societySlug, userRole, primaryColor = "#0052CC", societyLogo }: SidebarProps) {
  const pathname = usePathname();
  const prefix = `/${societySlug}`;

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside className="flex h-full w-64 flex-col bg-[#0b0b0d] text-zinc-300 border-r border-white/5">
      {/* Society Header */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/5">
        {societyLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={societyLogo} alt={societyName} className="h-8 w-8 object-contain flex-shrink-0" />
        ) : (
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            {societyName[0]}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate tracking-tight leading-tight">{societyName}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{userRole.toLowerCase()}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">Menu</p>
        <div className="space-y-0.5">
          {navItems
            .filter((item) => !item.minRole || (ROLE_RANK[userRole] ?? 0) >= ROLE_RANK[item.minRole])
            .map((item) => {
              const href = `${prefix}${item.href}`;
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-white/[0.07] text-white font-medium"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full bg-[#00ffd1] transition-opacity",
                      active ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <item.icon className={cn("h-[18px] w-[18px] flex-shrink-0 transition-colors", active ? "text-white" : "text-zinc-500 group-hover:text-zinc-300")} />
                  {item.label}
                </Link>
              );
            })}
        </div>
      </nav>

      {/* User Footer */}
      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={user.image ?? ""} alt={user.name} />
            <AvatarFallback className="bg-white/10 text-zinc-200 text-xs font-medium">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-100 truncate">{user.name}</p>
            <p className="text-xs text-zinc-500 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex-shrink-0 rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
