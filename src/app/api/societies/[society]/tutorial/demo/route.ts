import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { TUTORIAL_MARKER as MARK } from "@/lib/tutorial";

// Demo records for the guided tour. Everything created here is prefixed with the
// tutorial marker and owned by the caller, which is also how it gets cleaned up:
// no schema flag needed. POST wipes first, so a tour abandoned mid-way (browser
// closed, no DELETE) leaves nothing behind the next time someone starts one.

type Params = { society: string };

const DAY = 86_400_000;
function at(days: number, hour: number) {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function wipe(societyId: string, userId: string) {
  const mine = { societyId, submittedById: userId };
  const [contents, rooms, claims] = await Promise.all([
    prisma.contentRequest.findMany({ where: { ...mine, eventName: { startsWith: MARK } }, select: { id: true } }),
    prisma.roomBooking.findMany({ where: { ...mine, eventName: { startsWith: MARK } }, select: { id: true } }),
    prisma.treasuryRequest.findMany({ where: { ...mine, description: { startsWith: MARK } }, select: { id: true } }),
  ]);
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  // Threads first: their FK to the request would only be nulled out, leaving orphans.
  await prisma.$transaction([
    prisma.thread.deleteMany({
      where: {
        OR: [
          { contentRequestId: { in: ids(contents) } },
          { roomBookingId: { in: ids(rooms) } },
          { treasuryRequestId: { in: ids(claims) } },
        ],
      },
    }),
    prisma.contentRequest.deleteMany({ where: { id: { in: ids(contents) } } }),
    prisma.roomBooking.deleteMany({ where: { id: { in: ids(rooms) } } }),
    prisma.treasuryRequest.deleteMany({ where: { id: { in: ids(claims) } } }),
    prisma.printingRequest.deleteMany({ where: { ...mine, fileName: { startsWith: MARK } } }),
    prisma.budgetCategory.deleteMany({ where: { societyId, name: { startsWith: MARK } } }),
    prisma.notification.deleteMany({ where: { userId, title: { startsWith: MARK } } }),
  ]);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const societyId = membership!.societyId;
  const userId = session!.user.id;
  await wipe(societyId, userId);

  // A budget category is an executive-level object, so only make one for an exec.
  // The tour explains the budget page either way.
  const category =
    membership!.role === "EXECUTIVE"
      ? await prisma.budgetCategory.create({
          data: {
            societyId,
            name: `${MARK} Events`,
            group: "PORTFOLIO",
            yearlyBudget: 500,
            budget2025: 400,
            usage2025: 380,
            worstCase: 700,
            reasoning: "Demo category created by the guided tour. Deleted when the tour ends.",
            notes: "Rows with reasoning or notes expand in the Comparison view. This is what that looks like.",
            sortOrder: 999,
          },
        })
      : null;

  const content = await prisma.contentRequest.create({
    data: {
      societyId,
      submittedById: userId,
      eventName: `${MARK} Capture the Flag Night`,
      startDate: at(10, 18),
      endDate: at(10, 21),
      location: "CATS Room, UNSW",
      keyPoints:
        "- Beginner-friendly CTF, teams of up to 4\n- Pizza provided\n- Prizes for the top three teams\n- Bring a laptop",
      deadline: at(4, 17), // inside a week → amber card
      bannerRequired: true,
      blurbRequired: true,
      rubricRequired: true,
      otherNotes: "Demo record created by the guided tour.",
      status: "SUBMITTED",
    },
  });
  const contentThread = await prisma.thread.create({ data: { contentRequestId: content.id } });
  await prisma.comment.create({
    data: {
      threadId: contentThread.id,
      authorId: userId,
      content: "Demo comment. This is what the discussion thread looks like on a request.",
    },
  });

  const room = await prisma.roomBooking.create({
    data: {
      societyId,
      submittedById: userId,
      eventName: `${MARK} Weekly Workshop`,
      preferredDate: at(3, 0), // under 7 business days → late-submission warning
      startTime: "18:00",
      endTime: "21:00",
      description: "Demo record created by the guided tour. Hands-on workshop with an industry guest.",
      maxAttendees: 60,
      hasExternalGuests: true,
      numExternalGuests: 2,
      externalGuestsDesc: "Two guest speakers from a partner company, presenting only; no payment involved.",
      preferredLocation: "SECLAB",
      safetyOfficerName: session!.user.name ?? "Demo Officer",
      safetyOfficerZid: "z0000000",
      safetyOfficerPhone: "0400 000 000",
      roomRequirements: "Projector, power for 60 laptops, step-free access.",
      status: "SUBMITTED",
    },
  });
  await prisma.thread.create({ data: { roomBookingId: room.id } });

  const claim = await prisma.treasuryRequest.create({
    data: {
      societyId,
      submittedById: userId,
      contactEmail: session!.user.email,
      expenseDate: at(-2, 12),
      locationSupplier: "Demo Pizza Co, Kingsford",
      description: `${MARK} Pizza for CTF night`,
      amount: 120.5,
      budgetCategoryId: category?.id ?? null,
      acknowledgedRules: true,
      status: "REIMBURSEMENT_PENDING",
    },
  });
  await prisma.thread.create({ data: { treasuryRequestId: claim.id } });

  const printing = await prisma.printingRequest.create({
    data: {
      societyId,
      submittedById: userId,
      clubName: membership!.society.name,
      contactName: session!.user.name ?? "Demo",
      contactEmail: session!.user.email,
      contactPhone: "N/A",
      pickupAt: at(5, 12),
      quantity: 50,
      pages: 2,
      paperSize: "A4",
      sided: "SINGLE",
      colour: "BW",
      fileUrl: "/uploads/tutorial-demo-placeholder.pdf", // placeholder, no real file
      fileName: `${MARK} flyer.pdf`,
      additionalDetails: "Demo record created by the guided tour. The attached file is a placeholder.",
      cost: 10, // 50 copies × 2 pages × $0.10
      status: "PENDING_APPROVAL",
    },
  });

  await prisma.notification.create({
    data: {
      userId,
      type: "STATUS_CHANGE",
      title: `${MARK} notification`,
      body: "Notifications look like this, and link straight to the request they came from.",
      link: `/requests/content/${content.id}`,
    },
  });

  return NextResponse.json({
    contentId: content.id,
    roomId: room.id,
    treasuryId: claim.id,
    printingId: printing.id,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  await wipe(membership!.societyId, session!.user.id);
  return NextResponse.json({ ok: true });
}
