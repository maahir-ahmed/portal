"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { timeAgo } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  body: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

interface HeaderProps {
  societySlug: string;
  onMobileMenuToggle?: () => void;
  mobileMenuOpen?: boolean;
}

export function Header({ societySlug, onMobileMenuToggle, mobileMenuOpen }: HeaderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polls an external API; state is set after the fetch resolves
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 gap-4 flex-shrink-0">
      {/* Mobile menu toggle */}
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMobileMenuToggle}>
        {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      <div className="flex-1" />

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative rounded-lg text-muted-foreground hover:text-foreground">
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 rounded-xl p-0 overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-3 py-8 text-sm text-center text-muted-foreground">You&apos;re all caught up.</div>
          ) : (
            notifications.slice(0, 8).map((n) => (
              <DropdownMenuItem key={n.id} asChild className="p-0 focus:bg-accent">
                <Link
                  href={n.link ? `/${societySlug}${n.link}` : "#"}
                  className="flex gap-2.5 px-3.5 py-2.5 cursor-pointer border-b border-border last:border-0"
                >
                  <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${n.isRead ? "bg-transparent" : "bg-[hsl(var(--brand-deep))]"}`} />
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium leading-tight truncate">{n.title}</span>
                    <span className="text-xs text-muted-foreground line-clamp-1">{n.body}</span>
                    <span className="text-[11px] text-muted-foreground/70 mt-0.5">{timeAgo(n.createdAt)}</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))
          )}
          {notifications.length > 0 && (
            <Link href={`/${societySlug}/notifications`} className="block text-center text-xs font-medium py-2.5 border-t border-border text-muted-foreground hover:text-foreground transition-colors">
              View all notifications
            </Link>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
