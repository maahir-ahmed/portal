import { NextRequest, NextResponse } from "next/server";
import { auditAccountChange } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requireAuth, serverError } from "@/lib/api";
import { checkBank } from "@/lib/bank";
import { z } from "zod";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const account = await prisma.bankAccount.findFirst({
    where: { userId: session!.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(account ?? null);
}

const schema = z.object({
  accountName: z.string().trim().min(1).max(100),
  bsb: z.string().trim().min(3).max(20),
  accountNumber: z.string().trim().min(3).max(30),
  // Optional: an email, phone number or ABN registered for PayID.
  payId: z.string().trim().max(100).optional(),
});

// Saves the user's bank details as a fresh default row. Old rows are left
// intact so claims referencing them keep the details they were paid to.
// Note: one row per save; prune old unreferenced rows if it ever matters
export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const userId = session!.user.id;

  try {
    const body = schema.parse(await req.json());

    const bank = checkBank(body.accountName, body.bsb, body.accountNumber, body.payId ?? "");
    if ("error" in bank) return NextResponse.json({ error: bank.error }, { status: 400 });

    // One transaction, so a failed create cannot leave the member with no default account.
    const account = await prisma.$transaction(async (tx) => {
      await tx.bankAccount.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.bankAccount.create({ data: { userId, ...bank, isDefault: true } });
    });

    // Which account a reimbursement is paid into: worth knowing it changed, and when.
    await auditAccountChange(userId, "BankAccount", { accountName: body.accountName });
    return NextResponse.json(account);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return serverError(err);
  }
}
