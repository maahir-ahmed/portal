"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { RubricShell } from "@/components/rubric/RubricShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, DollarSign } from "lucide-react";
import { useRubricClient } from "@/hooks/useRubricClient";

export default function RubricSettlementDetailPage() {
  const params = useParams<{ society: string; id: string }>();
  const rubric = useRubricClient(params.society);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rubric.call({ type: "getSocietyPortalSettlementDetail", sid: Number(params.id) })
      .then((d) => setData(d))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.society, params.id]);

  const subSettlements = (data?.allSettlements ?? []) as Record<string, unknown>[];

  return (
    <RubricShell>
      <div className="flex items-center gap-3 mb-4">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/${params.society}/rubric/settlements`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h2 className="text-lg font-semibold">
          {data?.settlementtype as string ?? "Settlement"} #{data?.settlementid as string ?? params.id}
        </h2>
      </div>

      {loading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {error && <p className="text-sm text-red-600 text-center py-8">{error}</p>}

      {!loading && !error && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5 text-center">
                <DollarSign className="h-5 w-5 mx-auto text-green-600 mb-1" />
                <p className="text-2xl font-bold text-green-700">${data.finalamount as string ?? "-"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Final Amount</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-2xl font-bold">{data.societyname as string ?? "-"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Society</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-2xl font-bold capitalize">{data.settlementtype as string ?? "-"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Type</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-2xl font-bold">{subSettlements.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Line Items</p>
              </CardContent>
            </Card>
          </div>

          {subSettlements.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Line Items</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        {Object.keys(subSettlements[0]).slice(0, 6).map((k) => (
                          <th key={k} className="pb-2 text-left font-medium text-muted-foreground capitalize">{k.replace(/_/g, " ")}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {subSettlements.map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                          {Object.entries(row).slice(0, 6).map(([k, v]) => (
                            <td key={k} className="py-2 pr-4">
                              {typeof v === "boolean" ? (v ? "Yes" : "No") : String(v ?? "-")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </RubricShell>
  );
}
