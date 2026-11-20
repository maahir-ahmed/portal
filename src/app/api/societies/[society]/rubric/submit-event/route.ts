import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api";
import { z } from "zod";
import { syncEventToDiscord } from "@/lib/discordEvents";
import { createAuditLog } from "@/lib/audit";
import { httpUrl } from "@/lib/schemas";

// The Rubric submitEvent call itself goes through the server proxy
// (/rubric/call, allowlisted and executive-only). This route only stamps the
// resulting event id and link onto our own content request.
const schema = z.object({
  contentRequestId: z.string().optional(),
  rubricEventId: z.string().optional(),
  // null clears the stored value (a reassignment to an event with no link or QR must not
  // keep the previous event's); left out leaves it alone.
  // Rubric can hand back "" for an event with no purchase page: that means no link, not a bad one.
  rubricEventLink: z.preprocess((v) => (v === "" ? null : v), httpUrl.nullable()).optional(),
  rubricQrCodeUrl: z.preprocess((v) => (v === "" ? null : v), httpUrl.nullable()).optional(),
  // false when linking an already-existing Rubric event (assignment, not submission)
  markSubmitted: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { session, membership, error: accessErr } = await requireRole(society);
  if (accessErr) return accessErr;
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
        rubricQrCodeUrl: parsed.data.rubricQrCodeUrl,
      },
    });
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "UPDATE",
      entityType: "ContentRequest",
      entityId: parsed.data.contentRequestId,
      metadata: { rubricEventId: parsed.data.rubricEventId ?? null, submitted: parsed.data.markSubmitted },
    });
    await syncEventToDiscord(
      parsed.data.contentRequestId,
      `${session!.user.name} ${parsed.data.markSubmitted ? "submitted the event to Rubric" : "linked the Rubric event"}.`
    );
  }

  return NextResponse.json({ ok: true });
}
