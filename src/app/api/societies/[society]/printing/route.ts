import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { PRINTING_COUNTS_TOWARD_BUDGET, SECRETARIAL_ALLOWANCE } from "@/lib/printing";
import { createPrintingRequest } from "@/lib/printingServer";
import { UPLOADED_FILE } from "@/lib/uploads";
import { refreshArcTier } from "@/lib/rubric";
import { z } from "zod";

// Contact details (club, name, email, phone) are derived server-side from the
// logged-in user + society (createPrintingRequest), so the form doesn't ask for them.
const schema = z.object({
  pickupAt: z.string().min(1),
  // Far past any real job, and low enough that the cost (A3 colour double sided at
  // the most) stays inside its Decimal(10,2) column instead of failing with a 500.
  quantity: z.number().int().positive().max(5000),
  pages: z.number().int().positive().max(5000),
  paperSize: z.enum(["A4", "A3"]),
  sided: z.enum(["SINGLE", "DOUBLE_SHORT", "DOUBLE_LONG"]),
  colour: z.enum(["BW", "COLOUR"]),
  fileUrl: z.string().regex(UPLOADED_FILE, "The file has to be uploaded here"),
  fileName: z.string().min(1).max(500),
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

  await refreshArcTier(membership!.societyId);
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

  // Contact details are the requester's own phone and email: only executives (who
  // arrange the printing) and the requester see them, as on the Members page.
  const isExec = membership!.role === "EXECUTIVE";
  const visible = requests.map((r) =>
    isExec || r.submittedById === session!.user.id ? r : { ...r, contactPhone: null, contactEmail: null }
  );
  return NextResponse.json({ requests: visible, budget, tier: soc!.secretarialTier });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());
    const request = await createPrintingRequest(membership!.societyId, session!.user.id, {
      ...body,
      pickupAt: new Date(body.pickupAt),
    });

    return NextResponse.json(request, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
