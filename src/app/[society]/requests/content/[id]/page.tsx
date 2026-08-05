import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ThreadView } from "@/components/requests/ThreadView";
import { StatusUpdater } from "@/components/requests/StatusUpdater";
import { MarketingContentPanel } from "@/components/requests/MarketingContentPanel";
import { RubricForm } from "./RubricForm";
import { RubricQrCode } from "@/components/requests/RubricQrCode";
import { SubmitToRubricDialog } from "@/components/requests/SubmitToRubricDialog";
import { AssignRubricEvent } from "@/components/requests/AssignRubricEvent";
import { formatDate, formatDateTime, formatTimeRange } from "@/lib/utils";
import { ArrowLeft, Calendar, MapPin, Clock, Hourglass, QrCode, ExternalLink, Send, Pencil } from "lucide-react";
import type { ContentRequestStatus } from "@prisma/client";

interface Props {
  params: Promise<{ society: string; id: string }>;
}

export default async function ContentRequestDetailPage({ params }: Props) {
  const { society: societySlug, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");

  const request = await prisma.contentRequest.findUnique({
    where: { id },
    include: {
      submittedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
      deliverables: { orderBy: { uploadedAt: "asc" } },
      thread: {
        include: {
          comments: {
            include: { author: { select: { id: true, name: true, avatarUrl: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!request || request.societyId !== membership.societyId) notFound();

  const isExec = membership.role === "EXECUTIVE";
  const isMarketing = isExec || (membership.title?.toLowerCase().includes("marketing") ?? false);

  // Assignment / Awaiting exec action removed; "Need more information" ordered before In Progress.
  const STATUSES: ContentRequestStatus[] = [
    "DRAFT", "SUBMITTED", "AWAITING_INFORMATION", "IN_PROGRESS",
    "COMPLETED", "CANCELLED",
  ];

  const isOwner = request.submittedById === session.user.id;
  const canEdit = (isOwner || isExec || membership.role === "DIRECTOR") && !["COMPLETED", "CANCELLED"].includes(request.status);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/${societySlug}/requests/content`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold truncate">{request.eventName}</h1>
            <StatusBadge status={request.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Submitted by {request.submittedBy.name} · {formatDateTime(request.createdAt)}
          </p>
        </div>
        {canEdit && (
          <Button asChild variant="outline" size="sm" data-tour="content-edit" className="flex-shrink-0">
            <Link href={`/${societySlug}/requests/content/${request.id}/edit`}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main details */}
        <div className="lg:col-span-2 space-y-4">
          <Card data-tour="content-details">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Event Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span><strong>Date:</strong> {formatDate(request.startDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span><strong>Time:</strong> {formatTimeRange(request.startDate, request.endDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span><strong>Location:</strong> {request.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Hourglass className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span><strong>Deadline:</strong> {formatDateTime(request.deadline)}</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Key Points</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{request.keyPoints}</p>
              </div>
              {request.otherNotes && (
                <div>
                  <p className="text-sm font-medium mb-1">Additional Notes</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{request.otherNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-tour="content-flags">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Content Required</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 flex-wrap">
                {request.bannerRequired && (
                  <span className={`text-sm px-3 py-1 rounded-full ${request.bannerDone ? "bg-green-100 text-green-700" : "bg-secondary text-secondary-foreground"}`}>Banner / Graphic{request.bannerDone ? " ✓" : ""}</span>
                )}
                {request.blurbRequired && (
                  <span className={`text-sm px-3 py-1 rounded-full ${request.blurbDone ? "bg-green-100 text-green-700" : "bg-secondary text-secondary-foreground"}`}>Event Blurb{request.blurbDone ? " ✓" : ""}</span>
                )}
                {request.rubricRequired && (
                  <span className={`text-sm px-3 py-1 rounded-full ${(request.rubricEventLink || request.rubricSubmittedAt) ? "bg-green-100 text-green-700" : "bg-secondary text-secondary-foreground"}`}>Rubric Event{(request.rubricEventLink || request.rubricSubmittedAt) ? " ✓" : ""}</span>
                )}
                {!request.bannerRequired && !request.blurbRequired && !request.rubricRequired && (
                  <span className="text-muted-foreground text-sm">None specified</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Marketing deliverables, editable for marketing/exec, read-only otherwise */}
          {isMarketing && (request.bannerRequired || request.blurbRequired) ? (
            <MarketingContentPanel
              societySlug={societySlug}
              requestId={request.id}
              bannerRequired={request.bannerRequired}
              blurbRequired={request.blurbRequired}
              currentStatus={request.status}
              initialBlurb={request.finishedBlurb ?? ""}
              initialBannerDone={request.bannerDone}
              initialBlurbDone={request.blurbDone}
              deliverables={request.deliverables}
            />
          ) : (request.deliverables.length > 0 || request.finishedBlurb) ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Finished Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {request.deliverables.length > 0 && (
                  <div className="space-y-1.5">
                    {request.deliverables.map((d) => (
                      <a key={d.id} href={d.fileUrl} download className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors">
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate">{d.fileName}</span>
                      </a>
                    ))}
                  </div>
                )}
                {request.finishedBlurb && (
                  <div>
                    <p className="text-sm font-medium mb-1">Event Blurb</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{request.finishedBlurb}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* Rubric section */}
          {request.rubricRequired && (
            <Card data-tour="content-rubric" className={request.rubricEventLink ? "border-green-200 bg-green-50/30" : "border-orange-200 bg-orange-50/30"}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <QrCode className="h-4 w-4" /> Rubric Event
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Submitted to Rubric via platform */}
                {request.rubricSubmittedAt && (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <Send className="h-4 w-4 flex-shrink-0" />
                    <span>
                      Submitted to Rubric on {formatDateTime(request.rubricSubmittedAt)}.
                      Check your Rubric portal for the live event link.
                    </span>
                  </div>
                )}

                {/* Manual link attachment */}
                {request.rubricEventLink ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <a href={request.rubricEventLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
                        <ExternalLink className="h-4 w-4" /> View Rubric Event
                      </a>
                      {request.rubricEventId && (
                        <Link
                          href={`/${societySlug}/rubric/events/${request.rubricEventId}`}
                          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" /> Attendance &amp; stats
                        </Link>
                      )}
                    </div>
                    {isExec && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Activity grant:</span>
                        <StatusBadge status={request.activityGrantStatus} />
                        <Link href={`/${societySlug}/rubric/web?type=grants&id=${request.id}`} className="text-blue-600 hover:underline text-xs">
                          Manage on web portal →
                        </Link>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium mb-2">QR Code</p>
                      <RubricQrCode value={request.rubricEventLink} />
                    </div>
                    {isExec && (
                      <AssignRubricEvent
                        societySlug={societySlug}
                        contentRequestId={request.id}
                        label="Reassign to a different event"
                      />
                    )}
                    {isExec && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Update Rubric link</summary>
                        <div className="mt-2">
                          <RubricForm requestId={request.id} societySlug={societySlug} defaultValue={request.rubricEventLink} />
                        </div>
                      </details>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {!request.rubricSubmittedAt && (
                      <div className="text-sm text-orange-700">
                        <p className="font-medium">Rubric event not yet created</p>
                        <p className="text-muted-foreground mt-0.5">Submit to Rubric directly or attach an existing event link.</p>
                      </div>
                    )}
                    {isExec && (
                      <div className="space-y-3">
                        <Button asChild size="sm" className="gap-2">
                          <Link href={`/${societySlug}/rubric/web`}>
                            <ExternalLink className="h-3.5 w-3.5" /> Create event on Rubric portal
                          </Link>
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Create the event on the Rubric portal, then assign it below.
                        </p>
                        <AssignRubricEvent societySlug={societySlug} contentRequestId={request.id} />
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Try submitting via the API instead (may not work yet)
                          </summary>
                          <div className="mt-2">
                            <SubmitToRubricDialog
                              societySlug={societySlug}
                              contentRequestId={request.id}
                              defaultEventName={request.eventName}
                              defaultDescription={request.keyPoints}
                              defaultAddress={request.location}
                              defaultStartDate={request.startDate}
                              defaultEndDate={request.endDate}
                              alreadySubmitted={request.rubricSubmittedAt}
                            />
                          </div>
                        </details>
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Or attach an existing Rubric event link manually
                          </summary>
                          <div className="mt-2">
                            <RubricForm requestId={request.id} societySlug={societySlug} />
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Thread */}
          <ThreadView
            comments={request.thread?.comments ?? []}
            requestType="content-request"
            requestId={request.id}
            societySlug={societySlug}
            isExec={isExec}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Submitted by</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <UserAvatar name={request.submittedBy.name} avatarUrl={request.submittedBy.avatarUrl} />
                <div>
                  <p className="text-sm font-medium">{request.submittedBy.name}</p>
                  <p className="text-xs text-muted-foreground">{request.submittedBy.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {isExec && (
            <StatusUpdater
              currentStatus={request.status}
              statuses={STATUSES}
              apiPath={`/api/societies/${societySlug}/content-requests/${request.id}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// RubricForm is defined in RubricForm.tsx (client component)
