import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  content: z.string().min(1).max(10000),
  isInternal: z.boolean().default(false),
  // Recorded as the audit entry's type, so one of the three the thread views send.
  requestType: z.enum(["content-request", "room-booking", "treasury"]),
});

type Params = { society: string; id: string };

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id: requestId } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());

    // Only execs can post internal notes
    if (body.isInternal && membership!.role !== "EXECUTIVE") {
      return NextResponse.json({ error: "Only executives can post internal notes" }, { status: 403 });
    }

    // Find the thread by request ID, scoped to this society so members of
    // one society can't comment on another society's requests.
    const societyId = membership!.societyId;
    const thread = await prisma.thread.findFirst({
      where: {
        OR: [
          { contentRequest: { id: requestId, societyId } },
          { roomBooking: { id: requestId, societyId } },
          { treasuryRequest: { id: requestId, societyId } },
        ],
      },
      include: { treasuryRequest: { select: { submittedById: true } } },
    });

    // A claim is its owner's and the executives' only (the same rule as the claim page),
    // so its thread is too: another member could otherwise comment on a claim they can't see.
    const foreignClaim =
      thread?.treasuryRequest &&
      membership!.role !== "EXECUTIVE" &&
      thread.treasuryRequest.submittedById !== session!.user.id;
    if (!thread || foreignClaim) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const comment = await prisma.comment.create({
      data: {
        threadId: thread.id,
        authorId: session!.user.id,
        content: body.content,
        isInternal: body.isInternal,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "COMMENT",
      entityType: body.requestType,
      entityId: requestId,
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
