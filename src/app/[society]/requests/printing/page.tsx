import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils";
import { PRINTING_COUNTS_TOWARD_BUDGET, SECRETARIAL_ALLOWANCE } from "@/lib/printing";
import { PrintingRates } from "@/components/requests/PrintingRates";
import { Printer, Plus, FileText, Info } from "lucide-react";

interface Props {
  params: Promise<{ society: string }>;
}

export default async function PrintingRequestsPage({ params }: Props) {
  const { society: societySlug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
    include: { society: { select: { id: true, secretarialTier: true } } },
  });
  if (!membership) redirect("/");

  const societyId = membership.society.id;
  const tier = membership.society.secretarialTier;

  const [requests, approvedSum] = await Promise.all([
    prisma.printingRequest.findMany({
      where: { societyId },
      include: { submittedBy: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.printingRequest.aggregate({ where: { societyId, status: { in: PRINTING_COUNTS_TOWARD_BUDGET } }, _sum: { cost: true } }),
  ]);

  const allowance = SECRETARIAL_ALLOWANCE[tier];
  const spent = Number(approvedSum._sum.cost ?? 0);
  const remaining = Math.round((allowance - spent) * 100) / 100;
  const pct = allowance > 0 ? Math.min(100, Math.round((spent / allowance) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center">
            <Printer className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Printing Requests</h1>
            <p className="text-sm text-muted-foreground">Club printing via Arc Front Desk</p>
          </div>
        </div>
        <Button asChild data-tour="printing-new" className="gap-2">
          <Link href={`/${societySlug}/requests/printing/new`}><Plus className="h-4 w-4" /> New Request</Link>
        </Button>
      </div>

      {/* Secretarial budget: visible to everyone */}
      <Card data-tour="printing-allowance">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm text-muted-foreground">Secretarial Allowance ({tier.charAt(0) + tier.slice(1).toLowerCase()} Tier)</p>
              <p className="text-2xl font-bold">
                ${remaining.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">remaining of ${allowance.toFixed(2)}</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground">${spent.toFixed(2)} spent</p>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full ${remaining < 0 ? "bg-red-500" : pct > 85 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Only approved requests are deducted.</p>
        </CardContent>
      </Card>

      {/* Price list, so the cost of a job can be checked before starting one */}
      <Card data-tour="printing-rates">
        <CardContent className="p-5 space-y-3">
          <div>
            <p className="text-sm font-medium">Printing rates</p>
            <p className="text-xs text-muted-foreground">What Arc charges per page, by size, sides and colour.</p>
          </div>
          <PrintingRates />
        </CardContent>
      </Card>

      {/* Multi-document disclaimer */}
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p>Each request is for a <strong>single document</strong>. If you need multiple documents printed, please submit a <strong>separate request for each</strong>.</p>
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <FileText className="h-8 w-8 text-gray-300" />
          <p className="text-muted-foreground text-sm">No printing requests yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r, i) => (
            <Link key={r.id} href={`/${societySlug}/requests/printing/${r.id}`} data-tour={i === 0 ? "printing-card" : undefined}>
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar name={r.submittedBy.name} avatarUrl={r.submittedBy.avatarUrl} />
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {r.quantity}× {r.pages}pp {r.paperSize} {r.colour === "BW" ? "B&W" : "Colour"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.submittedBy.name} · pickup {formatDate(r.pickupAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-semibold text-green-700">${Number(r.cost).toFixed(2)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
