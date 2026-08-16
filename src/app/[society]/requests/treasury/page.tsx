import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Plus, Wallet } from "lucide-react";

interface Props {
  params: Promise<{ society: string }>;
}

export default async function TreasuryPage({ params }: Props) {
  const { society: societySlug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");

  // Treasury claims are private to their submitter; only execs see everyone's.
  const canSeeAll = membership.role === "EXECUTIVE";

  const requests = await prisma.treasuryRequest.findMany({
    where: {
      societyId: membership.societyId,
      ...(!canSeeAll ? { submittedById: session.user.id } : {}),
    },
    include: {
      submittedBy: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Treasury Requests</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Reimbursements and expense claims</p>
        </div>
        <Button asChild data-tour="treasury-new">
          <Link href={`/${societySlug}/requests/treasury/new`}>
            <Plus className="h-4 w-4 mr-2" /> New Claim
          </Link>
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">No reimbursement requests found.</p>
            <Button asChild size="sm">
              <Link href={`/${societySlug}/requests/treasury/new`}>Submit first claim</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r, i) => {
            const amount = Number(r.amount);
            return (
              <Link key={r.id} href={`/${societySlug}/requests/treasury/${r.id}`} data-tour={i === 0 ? "treasury-card" : undefined}>
                <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <UserAvatar name={r.submittedBy.name} avatarUrl={r.submittedBy.avatarUrl} size="sm" className="mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{r.description}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span>📅 {formatDate(r.expenseDate)}</span>
                            <span>🏪 {r.locationSupplier}</span>
                            <span className="font-medium text-green-700">{formatCurrency(amount)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
