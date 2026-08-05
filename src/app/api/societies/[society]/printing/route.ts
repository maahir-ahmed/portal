import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { notifyExecs } from "@/lib/notifications";
import { computePrintingCost, PRINTING_COUNTS_TOWARD_BUDGET, SECRETARIAL_ALLOWANCE } from "@/lib/printing";
import { z } from "zod";

// Contact details (club, name, email, phone) are derived server-side from the
// logged-in user + society, so the form doesn't ask for them.
const schema = z.object({
  pickupAt: z.string().min(1),
  quantity: z.number().int().positive(),
  pages: z.number().int().positive(),
  paperSize: z.enum(["A4", "A3"]),
  sided: z.enum(["SINGLE", "DOUBLE_SHORT", "DOUBLE_LONG"]),
  colour: z.enum(["BW", "COLOUR"]),
  fileUrl: z.string().min(1),
  fileName: z.string().min(1),
  additionalDetails: z.string().optional(),
});

// Budget left = tier allowance − sum of approved-and-beyond request costs.
async function budgetFor(societyId: string, tier: keyof typeof SECRETARIAL_ALLOWANCE) {
  const approved = await prisma.printingRequest.aggregate({
    where: { societyId, status: { in: PRINTING_COUNTS_TOWARD_BUDGET } },
    _sum: { cost: true },
  });
  const allowance = SECRETARIAL_ALLOWANCE[tier];
  const spent = Number(approved._sum.cost ?? 0);
  return { allowance, spent, remaining: Math.round((allowance - spent) * 100) / 100 };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const soc = await prisma.society.findUnique({
    where: { id: membership!.societyId },
    select: { secretarialTier: true },
  });

  const [requests, budget] = await Promise.all([
    prisma.printingRequest.findMany({
      where: { societyId: membership!.societyId },
      include: { submittedBy: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
    }),
    budgetFor(membership!.societyId, soc!.secretarialTier),
  ]);

  return NextResponse.json({ requests, budget, tier: soc!.secretarialTier });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());
    const cost = computePrintingCost(body);

    // Derive contact details from the submitter + society.
    const [user, soc] = await Promise.all([
      prisma.user.findUnique({ where: { id: session!.user.id }, select: { name: true, email: true, phone: true } }),
      prisma.society.findUnique({ where: { id: membership!.societyId }, select: { name: true } }),
    ]);

    const request = await prisma.printingRequest.create({
      data: {
        societyId: membership!.societyId,
        submittedById: session!.user.id,
        clubName: soc?.name ?? "",
        contactName: user?.name ?? "",
        contactEmail: user?.email ?? "",
        contactPhone: user?.phone ?? "N/A",
        pickupAt: new Date(body.pickupAt),
        quantity: body.quantity,
        pages: body.pages,
        paperSize: body.paperSize,
        sided: body.sided,
        colour: body.colour,
        fileUrl: body.fileUrl,
        fileName: body.fileName,
        additionalDetails: body.additionalDetails || null,
        cost,
      },
    });

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "CREATE",
      entityType: "PrintingRequest",
      entityId: request.id,
    });

    await notifyExecs(
      membership!.societyId,
      "APPROVAL_REQUIRED",
      `New Printing Request from ${session!.user.name}`,
      `${body.quantity}× ${body.pages}pp ${body.paperSize} ${body.colour === "BW" ? "B&W" : "Colour"}, est. $${cost.toFixed(2)}.`,
      `/requests/printing/${request.id}`
    );

    return NextResponse.json(request, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
