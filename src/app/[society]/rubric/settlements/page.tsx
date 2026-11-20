"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { RubricShell } from "@/components/rubric/RubricShell";
import { RubricNotConfigured } from "@/components/rubric/RubricNotConfigured";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, DollarSign, ChevronRight } from "lucide-react";
import { useRubricQuery } from "@/hooks/useRubricQuery";

interface Settlement {
  settlementid?: number | string;
  settlementtype?: string;
  settlementdesc?: string;
  settlementamount?: string;
  finalamount?: string;
  created?: string;
  reference?: string;
}

export default function RubricSettlementsPage() {
  const params = useParams<{ society: string }>();
  const { data, error, loading } = useRubricQuery(params.society, async (call) => {
    const d = await call({ type: "getSocietyPortalSettlementList" });
    return (d.allSettlements ?? []) as Settlement[];
  });
  const settlements = data ?? [];

  if (loading) return <RubricShell><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></RubricShell>;
  if (error === "not_configured") return <RubricShell><RubricNotConfigured societySlug={params.society} /></RubricShell>;
  if (error) return <RubricShell><div className="flex flex-col items-center py-16 gap-3"><AlertCircle className="h-7 w-7 text-red-400" /><p className="text-sm text-muted-foreground">{error}</p></div></RubricShell>;

  if (settlements.length === 0) return (
    <RubricShell>
      <div className="flex flex-col items-center py-16 gap-3 text-center">
        <DollarSign className="h-8 w-8 text-gray-300" />
        <p className="text-muted-foreground text-sm">No settlements found</p>
      </div>
    </RubricShell>
  );

  const total = settlements.reduce((acc, s) => {
    const amt = parseFloat(String(s.finalamount ?? "0").replace(/[^0-9.]/g, ""));
    return acc + (isNaN(amt) ? 0 : amt);
  }, 0);

  return (
    <RubricShell>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">{settlements.length} settlement{settlements.length !== 1 ? "s" : ""}</p>
        <p className="font-bold text-lg text-green-700">Total: ${total.toFixed(2)}</p>
      </div>
      <div className="space-y-2">
        {settlements.map((s, i) => {
          const id = s.settlementid;
          return (
            <Card key={String(id ?? i)} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{s.settlementtype ?? "Settlement"} · {s.reference ?? `#${id ?? i + 1}`}</p>
                    </div>
                    {s.settlementdesc && <p className="text-sm text-muted-foreground mt-0.5">{s.settlementdesc}</p>}
                    {s.created && <p className="text-xs text-muted-foreground mt-1">{new Date(s.created.replace(" ", "T")).toLocaleDateString("en-AU", { dateStyle: "medium" })}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {s.finalamount && (
                      <p className="text-xl font-bold text-green-700">{s.finalamount}</p>
                    )}
                    {id && (
                      <Button asChild size="sm" variant="outline" className="gap-1">
                        <Link href={`/${params.society}/rubric/settlements/${id}`}>
                          Details <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </RubricShell>
  );
}
