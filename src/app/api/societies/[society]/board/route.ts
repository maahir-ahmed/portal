import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { z } from "zod";

// The exec board. Cards are a shared scratchpad, so — unlike every other write in
// this app — they are not audit logged: dragging a note between columns is not a
// governance event, and the log is where money and member data changes are found.
// ponytail: no audit trail, no notifications. Add them if the board ever holds
// something someone could dispute.
const schema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  lane: z.enum(["TODO", "DOING", "DONE"]).default("TODO"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());

    const card = await prisma.boardCard.create({
      data: {
        societyId: membership!.societyId,
        createdById: session!.user.id,
        lane: body.lane,
        title: body.title,
        notes: body.notes || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
      include: { createdBy: { select: { name: true, avatarUrl: true } } },
    });

    return NextResponse.json(card, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
