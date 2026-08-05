"use client";

/* eslint-disable @next/next/no-img-element -- Rubric serves these images from hosts we do not
   know ahead of time; next/image would need a wildcard remotePattern to render them. */

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { RubricShell } from "@/components/rubric/RubricShell";
import { RubricNotConfigured } from "@/components/rubric/RubricNotConfigured";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitToRubricDialog } from "@/components/requests/SubmitToRubricDialog";
import { Loader2, AlertCircle, ExternalLink, Calendar, Ticket, Eye, Archive } from "lucide-react";
import { toast } from "sonner";
import { useRubricClient } from "@/hooks/useRubricClient";
import { flattenEvents, type RubricEvent } from "@/lib/rubricEvents";

export default function RubricEventsPage() {
  const params = useParams<{ society: string }>();
  const rubric = useRubricClient(params.society);
  const [events, setEvents] = useState<RubricEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    rubric.call({ type: "getSocietyPortalTicketingHomePage" })
      .then((d) => setEvents(flattenEvents(d)))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg === "not_configured" ? "not_configured" : msg);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.society]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets its own loading flag; state already starts in that value on mount
  useEffect(() => { load(); }, [load]);

  async function handleArchive(eventId: string | number) {
    if (!confirm("Archive this event on Rubric?")) return;
    setArchiving(String(eventId));
    try {
      await rubric.call({ type: "archiveEvent", eventid: String(eventId) });
      toast.success("Event archived on Rubric");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setArchiving(null);
    }
  }

  const renderContent = () => {
    if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    if (error === "not_configured") return <RubricNotConfigured societySlug={params.society} />;
    if (error) return (
      <div className="flex flex-col items-center py-16 gap-3 text-center">
        <AlertCircle className="h-7 w-7 text-red-400" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
    if (events.length === 0) return (
      <div className="flex flex-col items-center py-16 gap-3 text-center">
        <Calendar className="h-8 w-8 text-gray-300" />
        <p className="text-muted-foreground text-sm">No events found on Rubric</p>
        <p className="text-xs text-muted-foreground">Submit events from a Content Request, or create one directly below.</p>
      </div>
    );

    return (
      <div className="space-y-3">
        {events.map((ev) => {
          const id = ev.eventid;
          return (
            <Card key={String(id)} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {ev.bannerurl && (
                    <img src={ev.bannerurl} alt="" className="h-16 w-24 object-cover rounded flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{ev.eventname ?? "Untitled Event"}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {ev.eventTime && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(ev.eventTime.replace(" ", "T")).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {ev.draft && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Draft</span>
                        )}
                        {ev.private && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Private</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      {ev.totalpaid != null && (
                        <span className="flex items-center gap-1">
                          <Ticket className="h-3 w-3" /> {ev.totalpaid} sold
                        </span>
                      )}
                      {ev.totalScanned != null && (
                        <span>{ev.totalScanned} scanned in</span>
                      )}
                      {ev.totalrev && ev.totalrev !== "$0.00" && (
                        <span className="text-green-700 font-medium">{ev.totalrev}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      {id && (
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
                          <Link href={`/${params.society}/rubric/events/${id}`}>
                            <Eye className="h-3 w-3" /> Details & Tickets
                          </Link>
                        </Button>
                      )}
                      {ev.purchaseurl && (
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
                          <a href={ev.purchaseurl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3" /> View on Rubric
                          </a>
                        </Button>
                      )}
                      {id && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleArchive(id)}
                          disabled={archiving === String(id)}
                        >
                          {archiving === String(id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                          Archive
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <RubricShell>
      <div data-tour="rubric-events" className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{events.length > 0 ? `${events.length} events on Rubric` : ""}</p>
        <SubmitToRubricDialog
          societySlug={params.society}
          defaultEventName=""
          defaultDescription=""
          defaultAddress=""
          defaultStartDate={new Date()}
        />
      </div>
      {renderContent()}
    </RubricShell>
  );
}
