"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { RubricShell } from "@/components/rubric/RubricShell";
import { RubricNotConfigured } from "@/components/rubric/RubricNotConfigured";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Users, Download } from "lucide-react";
import { useRubricClient } from "@/hooks/useRubricClient";

type Filter = "active" | "expired" | "pending";

interface RubricMember {
  fullname?: string;
  email?: string;
  membershiptype?: string;
  created?: string;
  phonenumber?: string;
  pricepaid?: string;
  membershipid?: number;
  responses?: Record<string, string>;
}

export default function RubricMembersPage() {
  const params = useParams<{ society: string }>();
  const rubric = useRubricClient(params.society);
  const [filter, setFilter] = useState<Filter>("active");
  const [members, setMembers] = useState<RubricMember[]>([]);
  const [homeData, setHomeData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((f: Filter) => {
    setLoading(true);
    Promise.all([
      rubric.call({ type: "getSocietyPortalMembershipHomePage" }),
      rubric.call({ type: "getSocietyPortalMembershipList", viewFilter: f }),
    ]).then(([home, list]) => {
      const memberships = (list.allMemberships ?? []) as RubricMember[];
      setMembers(memberships);
      setHomeData(home as Record<string, unknown>);
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg === "not_configured" ? "not_configured" : msg);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.society]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets its own loading flag; state already starts in that value on mount
  useEffect(() => { load(filter); }, [filter, load]);

  function exportCsv() {
    if (members.length === 0) return;
    const header = "Name,Email,Student Number,Degree,Study Year,Membership,Joined,Phone";
    const cell = (v?: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const rows = members.map((m) =>
      [
        cell(m.fullname), cell(m.email), cell(m.responses?.["Student Number"]),
        cell(m.responses?.["Degree"]), cell(m.responses?.["Study Year"]),
        cell(m.membershiptype?.trim()), cell(m.created), cell(m.phonenumber),
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rubric-members-${filter}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const FILTERS: Filter[] = ["active", "expired", "pending"];
  const filterLabel: Record<Filter, string> = { active: "Active", expired: "Expired", pending: "Pending" };

  const stats = homeData as Record<string, unknown> | null;

  return (
    <RubricShell>
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-2">
          {["active_count", "expired_count", "pending_count"].map((k) => (
            stats[k] != null && (
              <Card key={k}>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{String(stats[k])}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">{k.replace("_count", "")} members</p>
                </CardContent>
              </Card>
            )
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === f ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {filterLabel[f]}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={members.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error === "not_configured" ? (
        <RubricNotConfigured societySlug={params.society} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <AlertCircle className="h-7 w-7 text-red-400" /><p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <Users className="h-8 w-8 text-gray-300" />
          <p className="text-muted-foreground text-sm">No {filter} members found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Name", "Email", "Student #", "Degree", "Year", "Membership", "Joined"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.membershipid ?? i} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium">{m.fullname ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.email ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.responses?.["Student Number"] ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.responses?.["Degree"] || "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.responses?.["Study Year"] ?? "—"}</td>
                  <td className="px-4 py-2.5">{m.membershiptype?.trim() ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {m.created ? new Date(m.created).toLocaleDateString("en-AU") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-gray-50">
            {members.length} {filter} member{members.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </RubricShell>
  );
}
