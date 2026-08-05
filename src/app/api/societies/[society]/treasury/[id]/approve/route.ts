import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { isTreasuryApproved, treasuryApprovalsNeeded } from "@/lib/permissions";

type Params = { society: string; id: string };

// Approve a treasury request
export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const request = await prisma.treasuryRequest.findUnique({
    where: { id },
    include: { approvals: true },
  });
  if (!request || request.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (request.status !== "AWAITING_APPROVAL") {
    return NextResponse.json({ error: "Request is not awaiting approval" }, { status: 400 });
  }

  const already = request.approvals.find((a) => a.approvedById === session!.user.id);
  if (already) {
    return NextResponse.json({ error: "Already approved" }, { status: 400 });
  }

  // Check if this user is the Treasurer (marked in their membership title)
  const isTreasurer = membership!.role === "EXECUTIVE" && membership!.title?.toLowerCase().includes("treasurer");

  const approval = await prisma.treasuryApproval.create({
    data: {
      treasuryRequestId: id,
      approvedById: session!.user.id,
      isTreasurer,
    },
  });

  const allApprovals = [...request.approvals, approval];
  const amount = Number(request.amount);

  if (isTreasuryApproved(amount, allApprovals)) {
    await prisma.treasuryRequest.update({
      where: { id },
      data: { status: "REIMBURSEMENT_PENDING" },
    });

    await createNotification({
      userId: request.submittedById,
      type: "APPROVAL_REQUIRED",
      title: "Reimbursement Approved, Processing Soon",
      body: `Your claim for $${amount.toFixed(2)} has been fully approved and is now pending reimbursement.`,
      link: `/requests/treasury/${id}`,
    });
  }

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "APPROVE",
    entityType: "TreasuryRequest",
    entityId: id,
    metadata: { isTreasurer: isTreasurer ? true : false, approvalCount: allApprovals.length, needed: treasuryApprovalsNeeded(amount) },
  });

  return NextResponse.json(approval);
}

// Revoke approval
export async function DELETE(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const approval = await prisma.treasuryApproval.findUnique({
    where: { treasuryRequestId_approvedById: { treasuryRequestId: id, approvedById: session!.user.id } },
  });
  if (!approval) return NextResponse.json({ error: "No approval found" }, { status: 404 });

  await prisma.treasuryApproval.delete({
    where: { treasuryRequestId_approvedById: { treasuryRequestId: id, approvedById: session!.user.id } },
  });

  // If it had auto-advanced to reimbursement-pending, revert to awaiting.
  const request = await prisma.treasuryRequest.findUnique({ where: { id } });
  if (request?.status === "REIMBURSEMENT_PENDING") {
    await prisma.treasuryRequest.update({ where: { id }, data: { status: "AWAITING_APPROVAL" } });
  }

  return NextResponse.json({ ok: true });
}
