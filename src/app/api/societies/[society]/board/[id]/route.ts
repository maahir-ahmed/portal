import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { z } from "zod";

type Params = { society: string; id: string };

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  lane: z.enum(["TODO", "DOING", "DONE"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    const body = schema.parse(await req.json());

    // The society scope in the where clause IS the authorization check: an exec of
    // one society can't move another society's card by guessing an id.
    const updated = await prisma.boardCard.updateMany({
      where: { id, societyId: membership!.societyId },
      data: {
        ...(body.lane ? { lane: body.lane } : {}),
        ...(body.title ? { title: body.title } : {}),
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
      },
    });
    if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const deleted = await prisma.boardCard.deleteMany({
    where: { id, societyId: membership!.societyId },
  });
  if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
