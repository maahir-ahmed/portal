import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createNotification } from "@/lib/notifications";
import { syncEventToDiscord } from "@/lib/discordEvents";
import { createAuditLog } from "@/lib/audit";
import { httpUrl } from "@/lib/schemas";

type Params = { society: string; id: string };

const schema = z.object({
  rubricEventLink: httpUrl.or(z.literal("")).nullable().optional(),
  rubricQrCodeUrl: httpUrl.or(z.literal("")).nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  // JSON only (the one caller, RubricForm, sends JSON). A form-encoded body used to be
  // accepted too, and that is the one shape another site can post here without the
  // browser asking first.
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  const request = await prisma.contentRequest.findUnique({ where: { id } });
  if (!request || request.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Attaching the link starts the work only on a request still waiting for it; fixing
  // the link on a draft, an in-progress, completed or cancelled one leaves its status alone.
  const startsWork = request.status === "SUBMITTED" || request.status === "AWAITING_INFORMATION";
  const updated = await prisma.contentRequest.update({
    where: { id },
    data: {
      rubricEventLink: body.rubricEventLink,
      rubricQrCodeUrl: body.rubricQrCodeUrl || null,
      ...(startsWork ? { status: "IN_PROGRESS" as const } : {}),
    },
  });

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "UPDATE",
    entityType: "ContentRequest",
    entityId: id,
    metadata: { rubricAttached: true, ...(startsWork ? { from: request.status, to: "IN_PROGRESS" } : {}) },
  });

  await createNotification({
    userId: request.submittedById,
    societyId: request.societyId,
    type: "STATUS_CHANGE",
    title: `Rubric Event Attached: ${request.eventName}`,
    body: "An executive has attached the Rubric event link and QR code to your request.",
    link: `/requests/content/${id}`,
  });

  await syncEventToDiscord(id, `${session!.user.name} attached the Rubric event.`); // and ticks it off in the message

  return NextResponse.json(updated);
}
