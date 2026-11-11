import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { notifyExecs } from "@/lib/notifications";
import { z } from "zod";
import { UPLOADED_FILE } from "@/lib/uploads";
import { isPlausibleDate } from "@/lib/utils";
import { money, notDemo } from "@/lib/schemas";
import { checkBank } from "@/lib/bank";

// More than any claim has; keeps one request from writing thousands of rows.
const MAX_RECEIPTS = 20;

// Fields are optional so a partial claim can be saved as a DRAFT; the full set
// is enforced below only when the claim is actually submitted for approval.
const schema = z.object({
  contactEmail: z.union([z.string().email().max(320), z.literal("")]).optional(),
  expenseDate: z.string().refine((s) => s === "" || isPlausibleDate(s), "Enter a real date").optional(),
  locationSupplier: z.string().max(500).optional(),
  description: notDemo(z.string().max(10000)).optional(),
  amount: money.optional(),
  useExistingBank: z.boolean(),
  // The same limits as saving bank details on the Account page.
  bankAccountName: z.string().max(100).nullable().optional(),
  bankBsb: z.string().max(20).nullable().optional(),
  bankAccountNumber: z.string().max(30).nullable().optional(),
  bankPayId: z.string().trim().max(100).nullable().optional(),
  acknowledgedRules: z.boolean().optional(),
  receiptUrls: z.array(z.string().regex(UPLOADED_FILE, "Receipts have to be uploaded here")).max(MAX_RECEIPTS).optional(),
  budgetCategoryId: z.string().max(100).nullable().optional(),
  // The event this was spent on, if any.
  contentRequestId: z.string().max(100).nullable().optional(),
  status: z.enum(["DRAFT", "REIMBURSEMENT_PENDING"]).default("REIMBURSEMENT_PENDING"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());

    // A draft can be saved partial; submitting for reimbursement requires the full claim.
    const isSubmitting = body.status === "REIMBURSEMENT_PENDING";
    if (isSubmitting) {
      if (!body.acknowledgedRules) {
        return NextResponse.json({ error: "Must acknowledge reimbursement rules" }, { status: 400 });
      }
      if (!body.contactEmail || !body.locationSupplier?.trim() || !body.description?.trim() || !body.expenseDate || !body.amount || body.amount <= 0) {
        return NextResponse.json({ error: "Complete all fields before submitting the claim" }, { status: 400 });
      }
    }

    // A chosen category must belong to this society.
    if (body.budgetCategoryId) {
      const cat = await prisma.budgetCategory.findUnique({ where: { id: body.budgetCategoryId } });
      if (!cat || cat.societyId !== membership!.societyId) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
    }

    // Same for a linked event.
    if (body.contentRequestId) {
      const event = await prisma.contentRequest.findUnique({ where: { id: body.contentRequestId } });
      if (!event || event.societyId !== membership!.societyId) {
        return NextResponse.json({ error: "Invalid event" }, { status: 400 });
      }
    }

    // The account the claim is paid to: typed in here (checked like the Account page and
    // /claim check it) or the one on file. A draft may have none yet; a submit may not.
    const typed =
      !body.useExistingBank && body.bankAccountName && body.bankBsb && body.bankAccountNumber
        ? checkBank(body.bankAccountName.trim(), body.bankBsb.trim(), body.bankAccountNumber.trim(), body.bankPayId ?? "")
        : null;
    if (typed && "error" in typed) return NextResponse.json({ error: typed.error }, { status: 400 });
    if (isSubmitting && !typed && !(body.useExistingBank && (await prisma.bankAccount.count({ where: { userId: session!.user.id } })) > 0)) {
      return NextResponse.json({ error: "Add the bank account to pay this claim into (name, BSB and account number)." }, { status: 400 });
    }

    // One transaction: a failure part way must not leave a new bank account, or a claim
    // without its receipts or thread, behind.
    const request = await prisma.$transaction(async (tx) => {
      let bankAccountId: string | null = null;

      if (typed && !("error" in typed)) {
        // Check if user already has a bank account on file
        const existingCount = await tx.bankAccount.count({ where: { userId: session!.user.id } });
        const account = await tx.bankAccount.create({
          data: {
            userId: session!.user.id,
            accountName: typed.accountName,
            bsb: typed.bsb,
            accountNumber: typed.accountNumber,
            payId: typed.payId,
            isDefault: existingCount === 0, // first account becomes default
          },
        });
        bankAccountId = account.id;
      } else if (body.useExistingBank) {
        // Must match the ordering in GET /api/me/bank-account — that is the account
        // the form showed the submitter. A one-off account typed into an earlier claim
        // is newer but not default, and would otherwise be picked instead.
        const existing = await tx.bankAccount.findFirst({
          where: { userId: session!.user.id },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        });
        bankAccountId = existing?.id ?? null;
      }

      const request = await tx.treasuryRequest.create({
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
          contentRequestId: body.contentRequestId ?? null,
          acknowledgedRules: body.acknowledgedRules ?? false,
          status: body.status, // "DRAFT" or "REIMBURSEMENT_PENDING"
        },
      });

      if (body.receiptUrls?.length) {
        await tx.treasuryAttachment.createMany({
          data: body.receiptUrls.map((url: string) => ({
            treasuryRequestId: request.id,
            fileName: url.split("/").pop() ?? "receipt",
            fileUrl: url,
            fileSize: 0,
            mimeType: "application/octet-stream",
          })),
        });
      }

      await tx.thread.create({ data: { treasuryRequestId: request.id } });
      return request;
    });

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
      await notifyExecs(
        membership!.societyId,
        "EXECUTIVE_ACTION_REQUIRED",
        `Reimbursement to pay: $${amt.toFixed(2)} to ${session!.user.name}`,
        "Ready to pay out. Spending approval happens in the committee Discord.",
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
