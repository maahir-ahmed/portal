import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api";
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

    await prisma.bankAccount.updateMany({ where: { userId }, data: { isDefault: false } });
    const account = await prisma.bankAccount.create({ data: { userId, ...body, isDefault: true } });

    return NextResponse.json(account);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
