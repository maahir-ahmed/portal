"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Portfolio {
  id: string;
  name: string;
  discordRoleId: string | null;
}

/** Which Discord role each portfolio's deadline reminders ping (src/lib/reminders.ts). */
export function PortfolioRoles({ societySlug }: { societySlug: string }) {
  const base = `/api/societies/${societySlug}/portfolios`;
  const [portfolios, setPortfolios] = useState<Portfolio[] | null>(null);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch(base)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Portfolio[]) => {
        setPortfolios(list);
        setRoles(Object.fromEntries(list.map((p) => [p.id, p.discordRoleId ?? ""])));
      })
      .catch(() => setPortfolios([]));
  }, [base]);

  async function save(p: Portfolio) {
    setBusy(p.id);
    const res = await fetch(`${base}/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordRoleId: roles[p.id].trim() || null }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Could not save the role");
    setPortfolios((list) => list?.map((x) => (x.id === p.id ? { ...x, discordRoleId: data.discordRoleId } : x)) ?? null);
    toast.success(data.discordRoleId ? `${p.name} reminders will ping that role` : `${p.name} reminders cleared`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Discord: deadline reminders</CardTitle>
        <CardDescription>
          As an event&apos;s content deadline gets closer (two weeks, one week, two days,
          overdue), a reminder goes under its request in the marketing channel, pinging the
          portfolio running it, or the role above if that portfolio has none. Copy each role
          ID the same way as above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {portfolios === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : portfolios.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No portfolios yet, so reminders ping the marketing role above. Add portfolios in the Portfolios tab.
          </p>
        ) : (
          portfolios.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2">
              <span className="w-full truncate text-sm sm:w-40">{p.name}</span>
              <Input
                value={roles[p.id] ?? ""}
                onChange={(e) => setRoles({ ...roles, [p.id]: e.target.value })}
                placeholder="Role ID"
                inputMode="numeric"
                className="h-8 min-w-0 flex-1 text-sm"
                aria-label={`Discord role ID for ${p.name}`}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={busy === p.id || (roles[p.id] ?? "") === (p.discordRoleId ?? "")}
                onClick={() => save(p)}
              >
                Save
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
