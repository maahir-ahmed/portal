import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { z } from "zod";
import { syncEventToDiscord } from "@/lib/discordEvents";

// The Rubric submitEvent call itself goes through the server proxy
// (/rubric/call, allowlisted and executive-only). This route only stamps the
// resulting event id and link onto our own content request.
const schema = z.object({
  contentRequestId: z.string().optional(),
  rubricEventId: z.string().optional(),
  rubricEventLink: z.string().optional(),
  // false when linking an already-existing Rubric event (assignment, not submission)
  markSubmitted: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;
  if (membership!.role !== "EXECUTIVE") {
    return NextResponse.json({ error: "Exec only" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  if (parsed.data.contentRequestId) {
    // updateMany, so another society's or a missing id is a 404 rather than a thrown P2025.
    const { count } = await prisma.contentRequest.updateMany({
      where: { id: parsed.data.contentRequestId, societyId: membership!.societyId },
      data: {
        ...(parsed.data.markSubmitted ? { rubricSubmittedAt: new Date() } : {}),
        rubricEventId: parsed.data.rubricEventId,
        rubricEventLink: parsed.data.rubricEventLink,
      },
    });
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await syncEventToDiscord(
      parsed.data.contentRequestId,
      `${session!.user.name} ${parsed.data.markSubmitted ? "submitted the event to Rubric" : "linked the Rubric event"}.`
    );
  }

  return NextResponse.json({ ok: true });
}
