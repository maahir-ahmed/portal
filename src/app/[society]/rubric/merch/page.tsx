"use client";

/* eslint-disable @next/next/no-img-element -- Rubric serves these images from hosts we do not
   know ahead of time; next/image would need a wildcard remotePattern to render them. */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RubricShell } from "@/components/rubric/RubricShell";
import { RubricNotConfigured } from "@/components/rubric/RubricNotConfigured";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, Package, ShoppingCart, ExternalLink } from "lucide-react";
import { useRubricClient } from "@/hooks/useRubricClient";

interface MerchItem {
  itemid?: number | string;
  name?: string;
  price?: number | string;
  imageurl?: string;
  hidden?: boolean;
  sold?: number;
  stock?: number;
  purchaseurl?: string;
}

interface MerchOrder {
  orderid?: number | string;
  name?: string;
  email?: string;
  itemname?: string;
  quantity?: number;
  total?: number | string;
  orderdate?: string;
  status?: string;
  collected?: boolean;
}

export default function RubricMerchPage() {
  const params = useParams<{ society: string }>();
  const rubric = useRubricClient(params.society);
  const [listings, setListings] = useState<MerchItem[]>([]);
  const [orders, setOrders] = useState<MerchOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      rubric.call({ type: "getMerchListings" }),
      rubric.call({ type: "getMerchOrders" }),
    ]).then(([l, o]) => {
      setListings((l.items ?? l.merch ?? l.listings ?? []) as MerchItem[]);
      setOrders((o.orders ?? o.data ?? []) as MerchOrder[]);
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg === "not_configured" ? "not_configured" : msg);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.society]);

  if (loading) return <RubricShell><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></RubricShell>;
  if (error === "not_configured") return <RubricShell><RubricNotConfigured societySlug={params.society} /></RubricShell>;
  if (error) return <RubricShell><div className="flex flex-col items-center py-16 gap-3"><AlertCircle className="h-7 w-7 text-red-400" /><p className="text-sm text-muted-foreground">{error}</p></div></RubricShell>;

  return (
    <RubricShell>
      <div className="space-y-6">
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Package className="h-4 w-4" /> Merchandise Listings ({listings.length})
          </h2>
          {listings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No merchandise listings found</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((item, i) => (
                <Card key={String(item.itemid ?? i)} className={item.hidden ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    {item.imageurl && (
                      <img src={item.imageurl} alt={item.name} className="w-full h-32 object-cover rounded-md mb-3" />
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{item.name ?? "Unnamed item"}</p>
                        <p className="text-lg font-bold text-green-700 mt-0.5">
                          {item.price != null ? `$${item.price}` : "-"}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {item.sold != null && <p>{item.sold} sold</p>}
                        {item.stock != null && <p>{item.stock} left</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {item.hidden && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Hidden</span>
                      )}
                      {item.purchaseurl && (
                        <a href={item.purchaseurl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                          <ExternalLink className="h-3 w-3" /> View
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> Orders ({orders.length})
          </h2>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No orders found</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["Customer", "Email", "Item", "Qty", "Total", "Date", "Collected"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o, i) => (
                    <tr key={String(o.orderid ?? i)} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium">{o.name ?? "-"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{o.email ?? "-"}</td>
                      <td className="px-4 py-2.5">{o.itemname ?? "-"}</td>
                      <td className="px-4 py-2.5">{o.quantity ?? "-"}</td>
                      <td className="px-4 py-2.5 font-medium text-green-700">
                        {o.total != null ? `$${o.total}` : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {o.orderdate ? new Date(o.orderdate).toLocaleDateString("en-AU") : "-"}
                      </td>
                      <td className="px-4 py-2.5">
                        {o.collected ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Collected</span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-gray-50">
                {orders.length} order{orders.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </section>
      </div>
    </RubricShell>
  );
}
