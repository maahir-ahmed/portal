import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import { SIDED_LABELS, type Sided } from "@/lib/printing";
import { PrintingDecisionButtons } from "@/components/requests/PrintingDecisionButtons";
import { PrintingStageButton } from "@/components/requests/PrintingStageButton";
import { ConfirmDelete } from "@/components/requests/ConfirmDelete";
import { ArrowLeft, FileText, Printer } from "lucide-react";

interface Props {
  params: Promise<{ society: string; id: string }>;
}

export default async function PrintingRequestDetailPage({ params }: Props) {
  const { society: societySlug, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");

  const request = await prisma.printingRequest.findUnique({
    where: { id },
    include: { submittedBy: { select: { id: true, name: true, avatarUrl: true } } },
  });
  if (!request || request.societyId !== membership.societyId) redirect(`/${societySlug}/requests/printing`);

  const isExec = membership.role === "EXECUTIVE";
  const isOwner = request.submittedById === session.user.id;
  const canDelete = isExec || (isOwner && request.status === "PENDING_APPROVAL");

  // Post-approval stage actions (pre-approval uses PrintingDecisionButtons below).
  const stage =
    request.status === "PENDING_ARC_SUBMISSION"
      ? {
          border: "border-purple-200 bg-purple-50/50",
          action: "mark_submitted" as const,
          blurb: (
            <>
              Approved. Submit this job on the{" "}
              <Link href={`/${societySlug}/rubric/web?type=printing&id=${request.id}`} className="text-blue-600 hover:underline">
                Arc web portal
              </Link>
              , then mark it submitted.
            </>
          ),
        }
      : request.status === "SUBMITTED"
        ? {
            border: "border-blue-200 bg-blue-50/50",
            action: "mark_ready" as const,
            blurb: <>Submitted to Arc. Mark it once it&apos;s ready to collect from the Front Desk.</>,
          }
        : null;
  const detail = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2">
        <Link href={`/${societySlug}/requests/printing`}><ArrowLeft className="h-4 w-4" /> Back</Link>
      </Button>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center">
            <Printer className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Printing Request</h1>
            <p className="text-sm text-muted-foreground">{request.clubName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={request.status} />
          {canDelete && (
            <ConfirmDelete
              endpoint={`/api/societies/${societySlug}/printing/${request.id}`}
              redirect={`/${societySlug}/requests/printing`}
              title="Delete this printing request?"
              description="This permanently removes the request. If it was already approved, its cost no longer counts against the secretarial allowance. This cannot be undone."
              successMessage="Printing request deleted"
              confirmLabel="Delete request"
            />
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Job details</CardTitle></CardHeader>
        <CardContent>
          {detail("Quantity", `${request.quantity} copies`)}
          {detail("Pages per copy", request.pages)}
          {detail("Size", request.paperSize)}
          {detail("Sides", SIDED_LABELS[request.sided as Sided] ?? request.sided)}
          {detail("Colour", request.colour === "BW" ? "Black & White" : "Colour")}
          {detail("Latest pick-up", formatDateTime(request.pickupAt))}
          {detail("Estimated cost", <span className="text-green-700">${Number(request.cost).toFixed(2)}</span>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Contact &amp; file</CardTitle></CardHeader>
        <CardContent>
          {detail("Name", request.contactName)}
          {detail("Email", request.contactEmail)}
          {detail("Phone", request.contactPhone)}
          {detail("Document", (
            <a href={request.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> {request.fileName}
            </a>
          ))}
          {request.additionalDetails && detail("Notes", request.additionalDetails)}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <UserAvatar name={request.submittedBy.name} avatarUrl={request.submittedBy.avatarUrl} size="sm" />
          <p className="text-sm text-muted-foreground">
            Submitted by <span className="font-medium text-foreground">{request.submittedBy.name}</span>
          </p>
        </CardContent>
      </Card>

      {isExec && request.status === "PENDING_APPROVAL" && (
        <Card data-tour="printing-decision" className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Approving deducts <strong>${Number(request.cost).toFixed(2)}</strong> from the secretarial allowance.
            </p>
            <PrintingDecisionButtons societySlug={societySlug} requestId={request.id} />
          </CardContent>
        </Card>
      )}

      {isExec && stage && (
        <Card className={stage.border}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{stage.blurb}</p>
            <PrintingStageButton societySlug={societySlug} requestId={request.id} action={stage.action} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
