"use client";

import { useParams } from "next/navigation";
import { RubricShell } from "@/components/rubric/RubricShell";
import { RubricNotConfigured } from "@/components/rubric/RubricNotConfigured";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, FileText } from "lucide-react";
import { useRubricQuery } from "@/hooks/useRubricQuery";

interface Grant {
  uuid?: string;
  title?: string;
  granttype?: string;
  totalgrant?: string;
  totalclaimgrant?: string;
  totalpaid?: string;
  remainingBalance?: string;
  percentageused?: number;
}

interface DynamicCard {
  title?: string;
  value?: string;
}

export default function RubricGrantsPage() {
  const params = useParams<{ society: string }>();
  const { data, error, loading } = useRubricQuery(params.society, async (call) => {
    const d = await call({ type: "getSocietyPortalSettlementList" });
    return { grants: (d.fundingsummary ?? []) as Grant[], cards: (d.dynamicCards ?? []) as DynamicCard[] };
  });
  const grants = data?.grants ?? [];
  const cards = data?.cards ?? [];

  if (loading) return <RubricShell><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></RubricShell>;
  if (error === "not_configured") return <RubricShell><RubricNotConfigured societySlug={params.society} /></RubricShell>;
  if (error) return <RubricShell><div className="flex flex-col items-center py-16 gap-3"><AlertCircle className="h-7 w-7 text-red-400" /><p className="text-sm text-muted-foreground">{error}</p></div></RubricShell>;

  return (
    <RubricShell>
      {cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
          {cards.map((c, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.title}</p>
                <p className="text-lg font-bold mt-0.5">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {grants.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <FileText className="h-8 w-8 text-gray-300" />
          <p className="text-muted-foreground text-sm">No grant submissions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grants.map((g, i) => (
            <Card key={g.uuid ?? i}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{g.granttype?.trim() || g.title || "Grant"}</p>
                    {g.title && <p className="text-sm text-muted-foreground mt-0.5">{g.title}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      {g.totalpaid && <span>Paid: {g.totalpaid}</span>}
                      {g.remainingBalance && <span>Remaining: {g.remainingBalance}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {g.totalgrant && <p className="text-xl font-bold text-green-700">{g.totalgrant}</p>}
                    <p className="text-xs text-muted-foreground">granted</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </RubricShell>
  );
}
