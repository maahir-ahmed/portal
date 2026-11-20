import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership, serverError } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { canViewRequest } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  content: z.string().min(1).max(10000),
  isInternal: z.boolean().default(false),
  // Sent by the thread views but not trusted: the audit entry's type comes from the thread.
  requestType: z.string().optional(),
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
      include: {
        treasuryRequest: { select: { submittedById: true } },
        contentRequest: { select: { submittedById: true, assignedToId: true } },
        roomBooking: { select: { submittedById: true, assignedToId: true } },
      },
    });

    // A claim is its owner's and the executives' only (the same rule as the claim page),
    // so its thread is too: another member could otherwise comment on a claim they can't see.
    const foreignClaim =
      thread?.treasuryRequest &&
      membership!.role !== "EXECUTIVE" &&
      thread.treasuryRequest.submittedById !== session!.user.id;
    // An event or booking is open to the people canViewRequest names, so it takes
    // comments from them only: knowing its id is not enough.
    const foreignRequest =
      (thread?.contentRequest && !canViewRequest(membership!, session!.user.id, thread.contentRequest)) ||
      (thread?.roomBooking && !canViewRequest(membership!, session!.user.id, thread.roomBooking));
    if (!thread || foreignClaim || foreignRequest) {
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
      entityType: thread.contentRequest ? "content-request" : thread.roomBooking ? "room-booking" : "treasury",
      entityId: requestId,
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return serverError(err);
  }
}
