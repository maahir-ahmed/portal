"use client";

/* eslint-disable @next/next/no-img-element -- Rubric serves these images from hosts we do not
   know ahead of time; next/image would need a wildcard remotePattern to render them. */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { RubricShell } from "@/components/rubric/RubricShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, ExternalLink, Ticket, MapPin, Calendar, Users, DollarSign, Download, Search } from "lucide-react";
import { useRubricClient } from "@/hooks/useRubricClient";

interface EventDetail {
  eventname?: string;
  eventaddress?: string;
  eventtime?: string;
  purchaseurl?: string;
  bannerurl?: string;
  societyemail?: string;
  facebookurl?: string;
}

interface TicketData {
  allTickets?: unknown[];
  allKeys?: string[]; // custom-question column keys for this event (already present on each ticket)
  scannedin?: number;
  eventname?: string;
  societyname?: string;
  societycolor?: string;
  logo_url?: string;
}

// Standard Rubric ticket fields, ordered most-useful-first for the spreadsheet.
// Any keys not listed here (per-event custom questions) are appended after these.
const COLUMN_ORDER = [
  "fullname", "email", "phonenumber", "studentnumber", "standard_studentNumber",
  "tickettypename", "paid", "totalbill", "paymentmethod", "Ticket Scanned",
  "orderid", "ticketid", "tablenumber", "created", "updated",
  "custom_questions_submitted", "sortindex",
];

const fmt = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : v == null ? "" : String(v));

// Rubric bills come as "$26.67" (or "-" when free); parse to a number for totals.
const parseBill = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export default function RubricEventDetailPage() {
  const params = useParams<{ society: string; eventId: string }>();
  const rubric = useRubricClient(params.society);
  const [details, setDetails] = useState<EventDetail | null>(null);
  const [tickets, setTickets] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([
      rubric.call({ type: "getEventDetails", eventid: params.eventId }),
      rubric.call({ type: "getSocietyPortalEventTicketList", eventid: Number(params.eventId) }),
    ]).then(([d, t]) => {
      setDetails(d as EventDetail);
      setTickets(t as TicketData);
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load");
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.society, params.eventId]);

  const allTickets = (tickets?.allTickets ?? []) as Record<string, unknown>[];

  // Names that appear on more than one ticket, likely duplicate/multi purchases.
  const nameKey = (t: Record<string, unknown>) => ((t.fullname as string) ?? "").trim().toLowerCase();
  const nameCounts = allTickets.reduce<Record<string, number>>((acc, t) => {
    const k = nameKey(t);
    if (k) acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const dupNames = new Set(Object.entries(nameCounts).filter(([, n]) => n > 1).map(([k]) => k));
  const dupTicketCount = allTickets.filter((t) => dupNames.has(nameKey(t))).length;

  // Columns come from the actual keys Rubric returns (standard fields in a sensible
  // order, then any per-event custom questions) so the table + CSV mirror Rubric.
  const present = new Set<string>();
  for (const t of allTickets) for (const k of Object.keys(t)) present.add(k);
  for (const k of tickets?.allKeys ?? []) present.add(k);
  const columns = [
    ...COLUMN_ORDER.filter((k) => present.has(k)),
    ...[...present].filter((k) => !COLUMN_ORDER.includes(k)),
  ];

  const revenue = allTickets.reduce((acc, t) => acc + parseBill(t.totalbill), 0);

  // Search runs over every column, so a zID, ticket type or custom-question answer
  // finds its row just as a name does. The summary above stays on the full set —
  // it describes the event, not the search.
  const q = query.trim().toLowerCase();
  const shownTickets = q
    ? allTickets.filter((t) => columns.some((c) => fmt(t[c]).toLowerCase().includes(q)))
    : allTickets;
  const filtering = q.length > 0;

  // Attendance/ticket export, required when submitting activity grants on the Arc
  // portal. Exports every field Rubric provides, with Rubric's own field names.
  // Exports whatever the table is showing. With a search active that is the filtered
  // set, which is why the button carries the count — an Arc grant submission wants
  // every ticket, and a half-empty attendance sheet is easy to hand over by accident.
  function exportAttendanceCsv() {
    if (shownTickets.length === 0) return;
    const cell = (v: unknown) => `"${fmt(v).replace(/"/g, '""')}"`;
    const header = columns.map(cell).join(",");
    const rows = shownTickets.map((t) => columns.map((c) => cell(t[c])).join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = (details?.eventname ?? `event-${params.eventId}`).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.href = url; a.download = `attendance-${slug}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <RubricShell>
      <div className="flex items-center gap-3 mb-4">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/${params.society}/rubric/events`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h2 className="text-lg font-semibold">{details?.eventname ?? "Event Detail"}</h2>
      </div>

      {loading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {error && <p className="text-sm text-red-600 text-center py-8">{error}</p>}

      {!loading && !error && (
        <div className="space-y-6">
          {details?.bannerurl && (
            <img src={details.bannerurl} alt="" className="h-40 w-full object-contain rounded-xl border bg-gray-50" />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Event Info</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {details?.eventtime && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {new Date(details.eventtime).toLocaleString("en-AU", { dateStyle: "full", timeStyle: "short" })}
                    </div>
                  )}
                  {details?.eventaddress && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" /> {details.eventaddress}
                    </div>
                  )}
                  {details?.societyemail && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" /> {details.societyemail}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    {details?.purchaseurl && (
                      <Button asChild size="sm" variant="outline">
                        <a href={details.purchaseurl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Buy Tickets Page
                        </a>
                      </Button>
                    )}
                    {details?.facebookurl && (
                      <Button asChild size="sm" variant="outline">
                        <a href={details.facebookurl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Facebook Event
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Ticket className="h-4 w-4" /> Ticket Sales
                    </CardTitle>
                    {allTickets.length > 0 && (
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={exportAttendanceCsv} disabled={shownTickets.length === 0}>
                        <Download className="h-3.5 w-3.5" />
                        {filtering ? `Attendance CSV (${shownTickets.length})` : "Attendance CSV"}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {allTickets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No ticket data available</p>
                  ) : (
                    <>
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <div className="relative flex-1 min-w-[12rem]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search name, email, zID, ticket type…"
                          className="h-9 pl-9"
                          aria-label="Search tickets"
                        />
                      </div>
                      {filtering && (
                        <p className="text-xs text-muted-foreground">
                          {shownTickets.length} of {allTickets.length} tickets
                        </p>
                      )}
                    </div>
                    {shownTickets.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No tickets match “{query.trim()}”.</p>
                    ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm whitespace-nowrap">
                        <thead>
                          <tr className="border-b text-left">
                            {columns.map((c) => (
                              <th key={c} className="pb-2 pr-3 font-medium text-muted-foreground">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {shownTickets.map((t, i) => {
                            const isDup = dupNames.has(nameKey(t));
                            return (
                            <tr key={(t.ticketid as number) ?? i} className={`border-b last:border-0 ${isDup ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-gray-50"}`}>
                              {columns.map((c) => (
                                <td key={c} className={`py-2 pr-3 ${c === "fullname" ? "font-medium" : "text-muted-foreground"}`}>
                                  {fmt(t[c]) || "-"}
                                  {c === "fullname" && isDup && (
                                    <span className="ml-1.5 text-xs text-amber-700">×{nameCounts[nameKey(t)]}</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Summary</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Ticket className="h-3.5 w-3.5" /> Total tickets</span>
                    <span className="font-semibold">{allTickets.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Scanned in</span>
                    <span className="font-semibold">{tickets?.scannedin ?? 0}</span>
                  </div>
                  {dupTicketCount > 0 && (
                    <div className="flex items-center justify-between rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 -mx-0.5">
                      <span className="text-amber-800">Duplicate-name tickets</span>
                      <span className="font-semibold text-amber-800">{dupTicketCount} across {dupNames.size} {dupNames.size === 1 ? "name" : "names"}</span>
                    </div>
                  )}
                  {revenue > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Revenue</span>
                      <span className="font-semibold">${revenue.toFixed(2)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </RubricShell>
  );
}
