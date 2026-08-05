import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ThreadView } from "@/components/requests/ThreadView";
import { EditTreasuryClaim } from "@/components/requests/EditTreasuryClaim";
import { ConfirmDelete } from "@/components/requests/ConfirmDelete";
import { ClaimCategoryCard } from "@/components/requests/ClaimCategoryCard";
import { SubmitClaimButton } from "@/components/requests/SubmitClaimButton";
import { StatusUpdater } from "@/components/requests/StatusUpdater";
import { MarkReimbursedButton } from "@/components/requests/MarkReimbursedButton";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { ArrowLeft, Receipt, FileText, MessagesSquare } from "lucide-react";
import type { TreasuryStatus } from "@prisma/client";

interface Props {
  params: Promise<{ society: string; id: string }>;
}

const STATUSES: TreasuryStatus[] = ["DRAFT", "REIMBURSEMENT_PENDING", "REJECTED", "REIMBURSED"];

export default async function TreasuryDetailPage({ params }: Props) {
  const { society: societySlug, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");

  const isExec = membership.role === "EXECUTIVE";
  const [request, categories] = await Promise.all([
    prisma.treasuryRequest.findUnique({
      where: { id },
      include: {
        submittedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
        receipts: true,
        bankAccount: true,
        budgetCategory: { select: { id: true, name: true } },
        thread: {
          include: {
            comments: {
              include: { author: { select: { id: true, name: true, avatarUrl: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    }),
    isExec
      ? prisma.budgetCategory.findMany({
          where: { societyId: membership.societyId },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  if (!request || request.societyId !== membership.societyId) notFound();
  const isOwner = request.submittedById === session.user.id;
  // A claim is viewable only by its submitter and execs.
  if (!isExec && !isOwner) notFound();
  const canEdit = isExec || (isOwner && ["DRAFT", "REIMBURSEMENT_PENDING"].includes(request.status));
  const amount = Number(request.amount);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/${societySlug}/requests/treasury`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold truncate">{request.description}</h1>
            <StatusBadge status={request.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Submitted by {request.submittedBy.name} · {formatDateTime(request.createdAt)}
          </p>
        </div>
        {canEdit && (
          <div data-tour="claim-edit" className="flex items-center gap-2">
            {request.status === "DRAFT" && (
              <SubmitClaimButton societySlug={societySlug} requestId={request.id} />
            )}
            <EditTreasuryClaim
              societySlug={societySlug}
              requestId={request.id}
              initial={{
                description: request.description,
                amount,
                expenseDate: request.expenseDate.toISOString(),
                locationSupplier: request.locationSupplier,
                contactEmail: request.contactEmail,
              }}
              receipts={request.receipts.map((r) => ({ id: r.id, fileName: r.fileName, fileUrl: r.fileUrl }))}
            />
            <ConfirmDelete
              endpoint={`/api/societies/${societySlug}/treasury/${request.id}`}
              redirect={`/${societySlug}/requests/treasury`}
              title="Delete this claim?"
              description="This permanently removes the claim along with its receipts and comments. This cannot be undone."
              successMessage="Claim deleted"
              confirmLabel="Delete claim"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Expense Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="text-xl font-bold text-green-700">{formatCurrency(amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Expense Date</p>
                  <p className="font-medium">{formatDate(request.expenseDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Supplier</p>
                  <p className="font-medium">{request.locationSupplier}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Contact Email</p>
                  <p className="font-medium">{request.contactEmail}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{request.description}</p>
              </div>
            </CardContent>
          </Card>

          {/* Receipts */}
          {request.receipts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> Receipts & Attachments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {request.receipts.map((r) => (
                    <a
                      key={r.id}
                      href={r.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                    >
                      <FileText className="h-4 w-4" />
                      {r.fileName}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Spending approval happens in Discord; this page only tracks the payout. */}
          {request.status === "REIMBURSEMENT_PENDING" && (
            <Card data-tour="claim-payout">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessagesSquare className="h-4 w-4" /> Approval
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Spending is approved in the committee Discord. This claim is waiting to be paid out.
                </p>
                {isExec && <MarkReimbursedButton societySlug={societySlug} requestId={request.id} />}
              </CardContent>
            </Card>
          )}

          <ThreadView
            comments={request.thread?.comments ?? []}
            requestType="treasury"
            requestId={request.id}
            societySlug={societySlug}
            isExec={isExec}
          />
        </div>

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

          {(isExec || request.budgetCategory) && (
            <ClaimCategoryCard
              societySlug={societySlug}
              requestId={request.id}
              categoryId={request.budgetCategory?.id ?? null}
              categoryName={request.budgetCategory?.name ?? null}
              categories={categories}
              isExec={isExec}
            />
          )}

          {isExec && (
            <StatusUpdater
              currentStatus={request.status}
              statuses={STATUSES}
              apiPath={`/api/societies/${societySlug}/treasury/${request.id}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
