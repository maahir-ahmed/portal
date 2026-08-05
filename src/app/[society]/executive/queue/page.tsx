import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { MarkReimbursedButton } from "@/components/requests/MarkReimbursedButton";
import { PrintingStageButton } from "@/components/requests/PrintingStageButton";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Shield, QrCode, Building2, Banknote, CheckCircle, Printer } from "lucide-react";

interface Props {
  params: Promise<{ society: string }>;
}

export default async function ExecutiveQueuePage({ params }: Props) {
  const { society: societySlug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership || membership.role !== "EXECUTIVE") redirect(`/${societySlug}/dashboard`);

  const societyId = membership.societyId;

  const [rubricPending, roomPending, reimbursementPending, printingPending] = await Promise.all([
    prisma.contentRequest.findMany({
      where: { societyId, rubricRequired: true, rubricEventLink: null, status: { notIn: ["CANCELLED", "COMPLETED"] } },
      include: { submittedBy: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { deadline: "asc" },
    }),
    prisma.roomBooking.findMany({
      where: { societyId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      include: { submittedBy: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { preferredDate: "asc" },
    }),
    prisma.treasuryRequest.findMany({
      where: { societyId, status: "REIMBURSEMENT_PENDING" },
      include: {
        submittedBy: { select: { id: true, name: true, avatarUrl: true } },
        bankAccount: true,
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.printingRequest.findMany({
      // Everything still in flight: awaiting approval, awaiting Arc submission,
      // or at Arc. Ready-for-pickup and rejected jobs leave the queue.
      where: { societyId, status: { in: ["PENDING_APPROVAL", "PENDING_ARC_SUBMISSION", "SUBMITTED"] } },
      include: { submittedBy: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { pickupAt: "asc" },
    }),
  ]);

  const totalPending =
    rubricPending.length + roomPending.length + reimbursementPending.length + printingPending.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Executive Queue</h1>
          <p className="text-sm text-muted-foreground">
            {totalPending} item{totalPending !== 1 ? "s" : ""} requiring attention
          </p>
        </div>
      </div>

      {/* Rubric Events Pending */}
      {rubricPending.length > 0 && (
        <section data-tour="queue-rubric">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
            <QrCode className="h-4 w-4 text-orange-600" />
            Rubric Events Required
            <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">{rubricPending.length}</span>
          </h2>
          <div className="space-y-2">
            {rubricPending.map((r) => (
              <Link key={r.id} href={`/${societySlug}/requests/content/${r.id}`}>
                <Card className="hover:border-orange-300 border-orange-200 bg-orange-50/30 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar name={r.submittedBy.name} avatarUrl={r.submittedBy.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{r.eventName}</p>
                          <p className="text-xs text-muted-foreground">Deadline: {formatDate(r.deadline)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={r.status} />
                        <Button size="sm" variant="outline" className="text-xs border-orange-300">
                          Attach Rubric
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Room Bookings Queue */}
      {roomPending.length > 0 && (
        <section data-tour="queue-rooms">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-purple-600" />
            Room Bookings
            <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">{roomPending.length}</span>
          </h2>
          <div className="space-y-2">
            {roomPending.map((b) => (
              <Card key={b.id} className="hover:border-purple-300 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/${societySlug}/requests/room-booking/${b.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                      <UserAvatar name={b.submittedBy.name} avatarUrl={b.submittedBy.avatarUrl} size="sm" />
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{b.eventName}</p>
                        <div className="text-xs text-muted-foreground flex gap-2">
                          <span>{formatDate(b.preferredDate)}</span>
                          <span>{b.startTime}–{b.endTime}</span>
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={b.status} />
                      <Button asChild size="sm" variant="outline" className="text-xs border-purple-300">
                        <Link href={`/${societySlug}/rubric/web?type=room&id=${b.id}`}>Submit on Rubric →</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Printing: in flight (approval → Arc submission → pickup readiness) */}
      {printingPending.length > 0 && (
        <section data-tour="queue-printing">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
            <Printer className="h-4 w-4 text-blue-600" />
            Printing
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{printingPending.length}</span>
          </h2>
          <div className="space-y-2">
            {printingPending.map((p) => (
              <Card key={p.id} className="hover:border-blue-300 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/${societySlug}/requests/printing/${p.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                      <UserAvatar name={p.submittedBy.name} avatarUrl={p.submittedBy.avatarUrl} size="sm" />
                      <div className="min-w-0">
                        <p className="font-semibold truncate">
                          {p.quantity}× {p.pages}pp {p.paperSize} {p.colour === "BW" ? "B&W" : "Colour"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.submittedBy.name} · pickup {formatDate(p.pickupAt)}
                        </p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-medium text-green-700">{formatCurrency(Number(p.cost))}</span>
                      <StatusBadge status={p.status} />
                      {p.status === "PENDING_APPROVAL" && (
                        <Button asChild size="sm" variant="outline" className="text-xs border-blue-300">
                          <Link href={`/${societySlug}/requests/printing/${p.id}`}>Review</Link>
                        </Button>
                      )}
                      {p.status === "PENDING_ARC_SUBMISSION" && (
                        <Button asChild size="sm" variant="outline" className="text-xs border-purple-300">
                          <Link href={`/${societySlug}/rubric/web?type=printing&id=${p.id}`}>Submit on Rubric →</Link>
                        </Button>
                      )}
                      {p.status === "SUBMITTED" && (
                        <PrintingStageButton societySlug={societySlug} requestId={p.id} action="mark_ready" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Treasury: pending reimbursement */}
      {reimbursementPending.length > 0 && (
        <section data-tour="queue-reimburse">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
            <Banknote className="h-4 w-4 text-emerald-700" />
            Pending Reimbursement
            <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">{reimbursementPending.length}</span>
          </h2>
          <div className="space-y-2">
            {reimbursementPending.map((t) => {
              const amount = Number(t.amount);
              return (
                <Card key={t.id} className="border-emerald-200 bg-emerald-50/30">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar name={t.submittedBy.name} avatarUrl={t.submittedBy.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{t.description}</p>
                          <div className="text-xs text-muted-foreground flex flex-col gap-0.5 mt-0.5">
                            <div className="flex gap-2 items-center">
                              <span className="font-medium text-emerald-700">{formatCurrency(amount)}</span>
                              <span>·</span>
                              <span>{t.submittedBy.name}</span>
                            </div>
                            {t.bankAccount && (
                              <span>
                                BSB {t.bankAccount.bsb} · Acct {t.bankAccount.accountNumber} ({t.bankAccount.accountName})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link href={`/${societySlug}/requests/treasury/${t.id}`}>
                          <Button size="sm" variant="outline" className="text-xs">View</Button>
                        </Link>
                        <MarkReimbursedButton societySlug={societySlug} requestId={t.id} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {totalPending === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <p className="font-medium text-gray-700">All clear!</p>
            <p className="text-sm text-muted-foreground">No items require executive action.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
