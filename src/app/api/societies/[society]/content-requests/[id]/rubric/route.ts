import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createNotification } from "@/lib/notifications";
import { syncEventToDiscord } from "@/lib/discordEvents";
import { createAuditLog } from "@/lib/audit";

type Params = { society: string; id: string };

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const text = await req.text();
  let body: { rubricEventLink?: string | null; rubricQrCodeUrl?: string | null };
  try {
    body = JSON.parse(text);
  } catch {
    const form = new URLSearchParams(text);
    body = { rubricEventLink: form.get("rubricEventLink"), rubricQrCodeUrl: form.get("rubricQrCodeUrl") };
  }

  const request = await prisma.contentRequest.findUnique({ where: { id } });
  if (!request || request.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.contentRequest.update({
    where: { id },
    data: {
      rubricEventLink: body.rubricEventLink,
      rubricQrCodeUrl: body.rubricQrCodeUrl || null,
      status: "IN_PROGRESS",
    },
  });

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "UPDATE",
    entityType: "ContentRequest",
    entityId: id,
    metadata: { rubricAttached: true },
  });

  await createNotification({
    userId: request.submittedById,
    type: "STATUS_CHANGE",
    title: `Rubric Event Attached: ${request.eventName}`,
    body: "An executive has attached the Rubric event link and QR code to your request.",
    link: `/requests/content/${id}`,
  });

  await syncEventToDiscord(id); // ticks the Rubric event off in the marketing channel

  return NextResponse.json(updated);
}
