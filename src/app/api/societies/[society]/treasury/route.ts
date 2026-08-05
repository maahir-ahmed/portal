import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { notifyExecs } from "@/lib/notifications";
import { treasuryApprovalsNeeded } from "@/lib/permissions";
import { z } from "zod";

// Fields are optional so a partial claim can be saved as a DRAFT; the full set
// is enforced below only when the claim is actually submitted for approval.
const schema = z.object({
  contactEmail: z.union([z.string().email(), z.literal("")]).optional(),
  expenseDate: z.string().optional(),
  locationSupplier: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().nonnegative().optional(),
  useExistingBank: z.boolean(),
  bankAccountName: z.string().nullable().optional(),
  bankBsb: z.string().nullable().optional(),
  bankAccountNumber: z.string().nullable().optional(),
  saveToProfile: z.boolean().optional(),
  acknowledgedRules: z.boolean().optional(),
  receiptUrls: z.array(z.string()).optional(),
  budgetCategoryId: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "AWAITING_APPROVAL"]).default("AWAITING_APPROVAL"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());

    // A draft can be saved partial; submitting for approval requires the full claim.
    const isSubmitting = body.status === "AWAITING_APPROVAL";
    if (isSubmitting) {
      if (!body.acknowledgedRules) {
        return NextResponse.json({ error: "Must acknowledge reimbursement rules" }, { status: 400 });
      }
      if (!body.contactEmail || !body.locationSupplier?.trim() || !body.description?.trim() || !body.expenseDate || !body.amount || body.amount <= 0) {
        return NextResponse.json({ error: "Complete all fields before submitting for approval" }, { status: 400 });
      }
    }

    // A chosen category must belong to this society.
    if (body.budgetCategoryId) {
      const cat = await prisma.budgetCategory.findUnique({ where: { id: body.budgetCategoryId } });
      if (!cat || cat.societyId !== membership!.societyId) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
    }

    let bankAccountId: string | null = null;

    if (!body.useExistingBank && body.bankAccountName && body.bankBsb && body.bankAccountNumber) {
      // Check if user already has a bank account on file
      const existingCount = await prisma.bankAccount.count({ where: { userId: session!.user.id } });
      const account = await prisma.bankAccount.create({
        data: {
          userId: session!.user.id,
          accountName: body.bankAccountName,
          bsb: body.bankBsb,
          accountNumber: body.bankAccountNumber,
          isDefault: existingCount === 0, // first account becomes default
        },
      });
      bankAccountId = account.id;
    } else if (body.useExistingBank) {
      const existing = await prisma.bankAccount.findFirst({
        where: { userId: session!.user.id },
        orderBy: { createdAt: "desc" },
      });
      bankAccountId = existing?.id ?? null;
    }

    const request = await prisma.treasuryRequest.create({
      data: {
        societyId: membership!.societyId,
        submittedById: session!.user.id,
        contactEmail: body.contactEmail || "",
        expenseDate: body.expenseDate ? new Date(body.expenseDate) : new Date(),
        locationSupplier: body.locationSupplier || "",
        description: body.description || "",
        amount: body.amount ?? 0,
        bankAccountId,
        budgetCategoryId: body.budgetCategoryId ?? null,
        acknowledgedRules: body.acknowledgedRules ?? false,
        status: body.status, // "DRAFT" or "AWAITING_APPROVAL"
      },
    });

    if (body.receiptUrls?.length) {
      await prisma.treasuryAttachment.createMany({
        data: body.receiptUrls.map((url: string) => ({
          treasuryRequestId: request.id,
          fileName: url.split("/").pop() ?? "receipt",
          fileUrl: url,
          fileSize: 0,
          mimeType: "application/octet-stream",
        })),
      });
    }

    await prisma.thread.create({ data: { treasuryRequestId: request.id } });

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "CREATE",
      entityType: "TreasuryRequest",
      entityId: request.id,
    });

    // Drafts aren't in the queue yet; only alert execs on a real submission.
    if (isSubmitting) {
      const amt = body.amount ?? 0;
      const needed = treasuryApprovalsNeeded(amt);
      await notifyExecs(
        membership!.societyId,
        "APPROVAL_REQUIRED",
        `New Reimbursement: $${amt.toFixed(2)} from ${session!.user.name}`,
        `Requires ${needed} approval${needed > 1 ? "s" : ""}${amt >= 50 ? " including the Treasurer" : ""}.`,
        `/requests/treasury/${request.id}`
      );
    }

    return NextResponse.json(request, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
