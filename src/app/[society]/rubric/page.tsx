"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RubricShell } from "@/components/rubric/RubricShell";
import { RubricNotConfigured } from "@/components/rubric/RubricNotConfigured";
import { Loader2, TrendingUp, Users, Package, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";
import { useRubricClient } from "@/hooks/useRubricClient";
import { flattenEvents } from "@/lib/rubricEvents";
import { formatCurrency } from "@/lib/utils";

interface OverviewData {
  membership: Record<string, unknown> | null;
  ticketing: Record<string, unknown> | null;
  settlement: Record<string, unknown> | null;
  team: Record<string, unknown> | null;
}

function StatCard({ label, value, icon: Icon, color = "blue" }: {
  label: string; value: string | number | null | undefined;
  icon: React.ElementType; color?: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value ?? "—"}</p>
          </div>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RubricOverviewPage() {
  const params = useParams<{ society: string }>();
  const rubric = useRubricClient(params.society);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    rubric.getToken().then(() => {
      return Promise.allSettled([
        rubric.call({ type: "getSocietyPortalMembershipList", viewFilter: "active" }),
        rubric.call({ type: "getSocietyPortalTicketingHomePage" }),
        rubric.call({ type: "getSocietyPortalSettlementList" }),
        rubric.call({ type: "getSocietyTeamMembers", complete: true }),
      ]);
    }).then(([membership, ticketing, settlement, team]) => {
      setData({
        membership: membership.status === "fulfilled" ? membership.value : null,
        ticketing: ticketing.status === "fulfilled" ? ticketing.value : null,
        settlement: settlement.status === "fulfilled" ? settlement.value : null,
        team: team.status === "fulfilled" ? team.value : null,
      });
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg === "not_configured" ? "not_configured" : msg);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.society]);

  if (loading) return (
    <RubricShell>
      <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
    </RubricShell>
  );

  if (error === "not_configured") return (
    <RubricShell><RubricNotConfigured societySlug={params.society} /></RubricShell>
  );

  if (error) return (
    <RubricShell>
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    </RubricShell>
  );

  const activeList = ((data?.membership as Record<string, unknown> | null)?.allMemberships as unknown[] | undefined);
  const activeMembers = activeList?.length || undefined;

  const events = flattenEvents(data?.ticketing ?? null);
  const totalEvents = events.length || undefined;
  const revenue = events.reduce((sum, e) => sum + parseFloat(String(e.totalrev ?? "0").replace(/[^0-9.]/g, "") || "0"), 0);

  const grants = ((data?.settlement as Record<string, unknown> | null)?.fundingsummary as unknown[]) ?? [];
  const grantsCount = grants.length || undefined;

  const team = data?.team as Record<string, unknown> | null;
  const members = (team?.members as unknown[]) ?? [];
  const acceptedMembers = members.filter((m) => (m as Record<string, unknown>).accepted);

  return (
    <RubricShell>
      {/* Stats grid */}
      <div data-tour="rubric-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Ticket Revenue" value={revenue > 0 ? formatCurrency(revenue) : undefined} icon={TrendingUp} color="green" />
        <StatCard label="Grants" value={grantsCount} icon={Package} color="amber" />
        <StatCard label="Active Members" value={activeMembers} icon={Users} color="blue" />
        <StatCard label="Total Events" value={totalEvents} icon={TrendingUp} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rubric Team Members */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Rubric Team ({acceptedMembers.length} active)</CardTitle>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No team members found</p>
            ) : (
              <div className="space-y-2">
                {members.slice(0, 6).map((m, i) => {
                  const mem = m as Record<string, unknown>;
                  return (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{mem.name as string}</p>
                        <p className="text-xs text-muted-foreground">{(mem.role as Record<string, unknown>)?.name as string}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {mem.accepted ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Invited</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {members.length > 6 && (
                  <p className="text-xs text-muted-foreground pt-1">+{members.length - 6} more</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick links */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Rubric Portal Links</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { label: "Society Dashboard", href: "https://portal.hellorubric.com" },
              { label: "Event Manager", href: "https://portal.hellorubric.com/events" },
              { label: "Membership Manager", href: "https://portal.hellorubric.com/members" },
              { label: "Settlements", href: "https://portal.hellorubric.com/settlements" },
            ].map(({ label, href }) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> {label}
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </RubricShell>
  );
}
