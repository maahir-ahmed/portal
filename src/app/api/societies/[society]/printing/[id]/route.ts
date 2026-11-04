import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import type { PrintingStatus } from "@prisma/client";
import { z } from "zod";

type Params = { society: string; id: string };

const schema = z.object({ action: z.enum(["approve", "reject", "mark_submitted", "mark_ready"]) });

// Each action is only valid from one status, so replays/races can't skip stages.
const TRANSITIONS: Record<z.infer<typeof schema>["action"], { from: PrintingStatus; to: PrintingStatus }> = {
  approve: { from: "PENDING_APPROVAL", to: "PENDING_ARC_SUBMISSION" },
  reject: { from: "PENDING_APPROVAL", to: "REJECTED" },
  mark_submitted: { from: "PENDING_ARC_SUBMISSION", to: "SUBMITTED" },
  mark_ready: { from: "SUBMITTED", to: "READY_FOR_PICKUP" },
};

// Exec advances a printing request through its lifecycle. Budget is deducted
// from approval onward (the GET endpoint sums approved-and-beyond costs).
export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const request = await prisma.printingRequest.findUnique({ where: { id } });
  if (!request || request.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const action = parsed.data.action;
  const t = TRANSITIONS[action];
  const isDecision = action === "approve" || action === "reject";

  // Enforce the from-status atomically so concurrent execs can't double-advance.
  const updated = await prisma.printingRequest.updateMany({
    where: { id, societyId: membership!.societyId, status: t.from },
    data: {
      status: t.to,
      ...(isDecision ? { decidedById: session!.user.id, decidedAt: new Date() } : {}),
    },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: `Request is no longer ${t.from.replace(/_/g, " ").toLowerCase()}` }, { status: 409 });
  }

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: action === "approve" ? "APPROVE" : action === "reject" ? "REJECT" : "STATUS_CHANGE",
    entityType: "PrintingRequest",
    entityId: id,
    metadata: { from: t.from, to: t.to },
  });

  const cost = Number(request.cost).toFixed(2);
  const NOTIFICATIONS: Record<typeof action, { title: string; body: string }> = {
    approve: {
      title: "Printing Request Approved",
      body: `Your printing request ($${cost}) was approved and will be submitted to Arc for printing.`,
    },
    reject: {
      title: "Printing Request Rejected",
      body: "Your printing request was rejected. Check the request for details or resubmit.",
    },
    mark_submitted: {
      title: "Printing Request Submitted to Arc",
      body: `Your printing request ($${cost}) has been submitted to Arc. You'll be notified when it's ready for pickup.`,
    },
    mark_ready: {
      title: "Printing Ready for Pickup",
      body: `Your printing request ($${cost}) is ready to collect from Arc Front Desk.`,
    },
  };
  await createNotification({
    userId: request.submittedById,
    societyId: request.societyId,
    type: "STATUS_CHANGE",
    ...NOTIFICATIONS[action],
    link: `/requests/printing/${id}`,
  });

  return NextResponse.json({ ok: true });
}

// Requests are deletable by the submitter while still awaiting approval, and by execs.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const request = await prisma.printingRequest.findUnique({ where: { id } });
  if (!request || request.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isExec = membership!.role === "EXECUTIVE";
  const isOwner = request.submittedById === session!.user.id;
  if (!isExec && !(isOwner && request.status === "PENDING_APPROVAL")) {
    return NextResponse.json({ error: "This request can no longer be deleted" }, { status: 403 });
  }

  // The where clause IS the authorization check, re-enforced atomically at
  // delete time. Notification cleanup after: nothing to roll back here.
  const deleted = await prisma.printingRequest.deleteMany({
    where: {
      id,
      societyId: membership!.societyId,
      ...(isExec ? {} : { submittedById: session!.user.id, status: "PENDING_APPROVAL" as PrintingStatus }),
    },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "This request can no longer be deleted" }, { status: 403 });
  }
  await prisma.notification.deleteMany({ where: { link: `/requests/printing/${id}` } });

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "DELETE",
    entityType: "PrintingRequest",
    entityId: id,
    metadata: {
      cost: Number(request.cost),
      status: request.status,
      submittedById: request.submittedById,
    },
  });

  if (!isOwner) {
    await createNotification({
      userId: request.submittedById,
      societyId: request.societyId,
      type: "STATUS_CHANGE",
      title: "Printing Request Deleted",
      body: `Your printing request ($${Number(request.cost).toFixed(2)}) was deleted by an executive.`,
      link: `/requests/printing`,
    });
  }

  return NextResponse.json({ ok: true });
}
