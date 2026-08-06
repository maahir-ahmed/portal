import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { createNotification, notifyExecs } from "@/lib/notifications";
import { z } from "zod";
import type { TreasuryStatus } from "@prisma/client";

type Params = { society: string; id: string };

// Claims are editable/deletable by the submitter until they've been paid out, and by execs.
const EDITABLE_STATUSES: TreasuryStatus[] = ["DRAFT", "REIMBURSEMENT_PENDING"];

// Every field is optional: callers send only what they're changing (a status flip,
// a reclassification, or a full field edit). Who may change what is enforced below.
const patchSchema = z.object({
  status: z.enum(["DRAFT", "REIMBURSEMENT_PENDING", "REJECTED", "REIMBURSED"]).optional(),
  budgetCategoryId: z.string().min(1).nullable().optional(),
  contactEmail: z.string().email().optional(),
  // Accepts "YYYY-MM-DD" from the date input or a full ISO string; rejects anything
  // new Date() would turn into an Invalid Date.
  expenseDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date").optional(),
  locationSupplier: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  // .finite() matters: JSON.parse turns 1e999 into Infinity, which reaches Decimal as junk.
  amount: z.number().nonnegative().finite().optional(),
  addReceipts: z.array(z.object({ fileName: z.string().optional(), fileUrl: z.string().min(1) })).optional(),
  removeReceiptIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 400 });
  }
  const body = parsed.data;

  const request = await prisma.treasuryRequest.findUnique({ where: { id } });
  if (!request || request.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isExec = membership!.role === "EXECUTIVE";
  const isOwner = request.submittedById === session!.user.id;
  // A claim is accessible only to its submitter and execs (404 hides existence).
  if (!isExec && !isOwner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const canEdit = isExec || (isOwner && EDITABLE_STATUSES.includes(request.status));

  // Owners may submit their own draft (DRAFT -> REIMBURSEMENT_PENDING); every other
  // status change is exec-only.
  const isOwnerSubmit =
    isOwner && !isExec && request.status === "DRAFT" && body.status === "REIMBURSEMENT_PENDING";
  if (body.status !== undefined && !isExec && !isOwnerSubmit) {
    return NextResponse.json({ error: "Only executives can change status" }, { status: 403 });
  }

  // A draft can only be submitted once it's a complete claim. Checks the stored
  // values (submit requests carry only { status }, not field edits).
  if (body.status === "REIMBURSEMENT_PENDING" && request.status === "DRAFT") {
    if (Number(request.amount) <= 0 || !request.description.trim() || !request.locationSupplier.trim() || !request.contactEmail.trim()) {
      return NextResponse.json(
        { error: "Complete the claim (amount, description, supplier, contact email) before submitting." },
        { status: 400 }
      );
    }
  }

  // Only execs classify a claim into a budget category. null = unclassify.
  if (body.budgetCategoryId !== undefined) {
    if (!isExec) {
      return NextResponse.json({ error: "Only executives can classify claims" }, { status: 403 });
    }
    if (body.budgetCategoryId !== null) {
      const cat = await prisma.budgetCategory.findUnique({ where: { id: body.budgetCategoryId } });
      if (!cat || cat.societyId !== membership!.societyId) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
    }
  }

  const editsFields =
    [body.contactEmail, body.expenseDate, body.locationSupplier, body.description, body.amount]
      .some((v) => v !== undefined) ||
    Array.isArray(body.addReceipts) || Array.isArray(body.removeReceiptIds);
  if (editsFields && !canEdit) {
    return NextResponse.json({ error: "This claim can no longer be edited" }, { status: 403 });
  }

  const updated = await prisma.treasuryRequest.update({
    where: { id },
    data: {
      ...((isExec || isOwnerSubmit) && body.status ? { status: body.status } : {}),
      ...(canEdit && body.contactEmail !== undefined ? { contactEmail: body.contactEmail } : {}),
      ...(canEdit && body.expenseDate !== undefined ? { expenseDate: new Date(body.expenseDate) } : {}),
      ...(canEdit && body.locationSupplier !== undefined ? { locationSupplier: body.locationSupplier } : {}),
      ...(canEdit && body.description !== undefined ? { description: body.description } : {}),
      ...(canEdit && body.amount !== undefined ? { amount: body.amount } : {}),
      ...(isExec && body.budgetCategoryId !== undefined ? { budgetCategoryId: body.budgetCategoryId } : {}),
    },
  });

  if (canEdit && Array.isArray(body.addReceipts) && body.addReceipts.length > 0) {
    await prisma.treasuryAttachment.createMany({
      data: body.addReceipts.map((r) => ({
        treasuryRequestId: id,
        fileName: r.fileName || r.fileUrl.split("/").pop() || "receipt",
        fileUrl: r.fileUrl,
        fileSize: 0,
        mimeType: "application/octet-stream",
      })),
    });
  }

  if (canEdit && Array.isArray(body.removeReceiptIds) && body.removeReceiptIds.length > 0) {
    await prisma.treasuryAttachment.deleteMany({
      where: { id: { in: body.removeReceiptIds }, treasuryRequestId: id },
    });
  }

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: body.status ? "STATUS_CHANGE" : "UPDATE",
    entityType: "TreasuryRequest",
    entityId: id,
    ...(body.status ? { metadata: { from: request.status, to: body.status } } : {}),
  });

  // Joining the payout queue (a draft being submitted) alerts the execs, exactly
  // like a brand-new claim does.
  if (body.status === "REIMBURSEMENT_PENDING" && request.status === "DRAFT") {
    const amt = Number(updated.amount);
    await notifyExecs(
      membership!.societyId,
      "EXECUTIVE_ACTION_REQUIRED",
      `Reimbursement to pay: $${amt.toFixed(2)} to ${session!.user.name}`,
      "Ready to pay out. Spending approval happens in the committee Discord.",
      `/requests/treasury/${id}`
    );
  }

  // Notify the submitter of a status change made by someone else (not self).
  if (body.status && body.status !== request.status && request.submittedById !== session!.user.id) {
    await createNotification({
      userId: request.submittedById,
      type: "STATUS_CHANGE",
      title: "Reimbursement Status Updated",
      body: `Your claim for $${request.amount} has been updated to ${body.status.replace(/_/g, " ").toLowerCase()}.`,
      link: `/requests/treasury/${id}`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const request = await prisma.treasuryRequest.findUnique({ where: { id } });
  if (!request || request.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isExec = membership!.role === "EXECUTIVE";
  const isOwner = request.submittedById === session!.user.id;
  const canDelete = isExec || (isOwner && EDITABLE_STATUSES.includes(request.status));
  if (!canDelete) {
    return NextResponse.json({ error: "This claim can no longer be deleted" }, { status: 403 });
  }

  // Re-enforce the predicate atomically at delete time: the status may have
  // changed since the check above (e.g. an exec approved the claim mid-flight).
  const deleteWhere = {
    id,
    societyId: membership!.societyId,
    ...(isExec ? {} : { submittedById: session!.user.id, status: { in: EDITABLE_STATUSES } }),
  };

  const NOT_DELETABLE = "CLAIM_NOT_DELETABLE";
  try {
    await prisma.$transaction(async (tx) => {
      // Receipts cascade; the comment thread's FK would only be nulled out, so
      // remove it explicitly. Stale notification links would
      // 404 once the claim is gone, so clear those too.
      await tx.thread.deleteMany({ where: { treasuryRequest: { is: deleteWhere } } });
      const deleted = await tx.treasuryRequest.deleteMany({ where: deleteWhere });
      if (deleted.count === 0) throw new Error(NOT_DELETABLE);
      await tx.notification.deleteMany({ where: { link: `/requests/treasury/${id}` } });
    });
  } catch (err) {
    if (err instanceof Error && err.message === NOT_DELETABLE) {
      return NextResponse.json({ error: "This claim can no longer be deleted" }, { status: 403 });
    }
    throw err;
  }

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "DELETE",
    entityType: "TreasuryRequest",
    entityId: id,
    metadata: {
      description: request.description,
      amount: Number(request.amount),
      status: request.status,
      submittedById: request.submittedById,
    },
  });

  if (!isOwner) {
    await createNotification({
      userId: request.submittedById,
      type: "STATUS_CHANGE",
      title: "Reimbursement Claim Deleted",
      body: `Your claim for $${Number(request.amount).toFixed(2)} (${request.locationSupplier}) was deleted by an executive.`,
      link: `/requests/treasury`,
    });
  }

  return NextResponse.json({ ok: true });
}
