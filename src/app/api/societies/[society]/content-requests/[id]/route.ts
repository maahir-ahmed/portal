import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";


type Params = { society: string; id: string };

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const body = await req.json();

  const request = await prisma.contentRequest.findUnique({ where: { id } });
  if (!request || request.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canManage = membership!.role === "EXECUTIVE" || membership!.role === "DIRECTOR";
  const isOwner = request.submittedById === session!.user.id;
  // Marketing directors (or execs) may fill in the finished content.
  const isMarketing =
    membership!.role === "EXECUTIVE" || (membership!.title?.toLowerCase().includes("marketing") ?? false);
  // Owner or manager may edit the request's own details.
  const canEditCore = isOwner || canManage;

  if (!canEditCore && !canManage && !isMarketing) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The activity grant is only ever "not lodged with Arc yet" or "lodged"; the app
  // doesn't track Arc's decision on it, so the other enum values are unreachable.
  if (
    body.activityGrantStatus !== undefined &&
    !["NOT_SUBMITTED", "SUBMITTED"].includes(body.activityGrantStatus)
  ) {
    return NextResponse.json({ error: "Invalid grant status" }, { status: 400 });
  }

  const updated = await prisma.contentRequest.update({
    where: { id },
    data: {
      ...(canManage && body.status ? { status: body.status } : {}),
      ...(canManage && body.activityGrantStatus ? { activityGrantStatus: body.activityGrantStatus } : {}),
      ...(canEditCore && typeof body.eventName === "string" ? { eventName: body.eventName } : {}),
      ...(canEditCore && body.startDate ? { startDate: new Date(body.startDate) } : {}),
      ...(canEditCore && body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
      ...(canEditCore && typeof body.location === "string" ? { location: body.location } : {}),
      ...(canEditCore && typeof body.keyPoints === "string" ? { keyPoints: body.keyPoints } : {}),
      ...(canEditCore && body.deadline ? { deadline: new Date(body.deadline) } : {}),
      ...(canEditCore && typeof body.bannerRequired === "boolean" ? { bannerRequired: body.bannerRequired } : {}),
      ...(canEditCore && typeof body.blurbRequired === "boolean" ? { blurbRequired: body.blurbRequired } : {}),
      ...(canEditCore && typeof body.rubricRequired === "boolean" ? { rubricRequired: body.rubricRequired } : {}),
      ...(canEditCore && body.otherNotes !== undefined ? { otherNotes: body.otherNotes || null } : {}),
      ...(isMarketing && body.finishedBlurb !== undefined ? { finishedBlurb: body.finishedBlurb || null } : {}),
      ...(isMarketing && typeof body.bannerDone === "boolean" ? { bannerDone: body.bannerDone } : {}),
      ...(isMarketing && typeof body.blurbDone === "boolean" ? { blurbDone: body.blurbDone } : {}),
    },
  });

  if (isMarketing && Array.isArray(body.addDeliverables) && body.addDeliverables.length > 0) {
    await prisma.contentDeliverable.createMany({
      data: body.addDeliverables
        .filter((d: { fileUrl?: string }) => d?.fileUrl)
        .map((d: { fileName?: string; fileUrl: string }) => ({
          contentRequestId: id,
          fileName: d.fileName || d.fileUrl.split("/").pop() || "graphic",
          fileUrl: d.fileUrl,
        })),
    });
  }

  if (isMarketing && Array.isArray(body.removeDeliverableIds) && body.removeDeliverableIds.length > 0) {
    await prisma.contentDeliverable.deleteMany({
      where: { id: { in: body.removeDeliverableIds }, contentRequestId: id },
    });
  }

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: body.status ? "STATUS_CHANGE" : "UPDATE",
    entityType: "ContentRequest",
    entityId: id,
    ...(body.status ? { metadata: { from: request.status, to: body.status } } : {}),
  });

  if (body.status && body.status !== request.status) {
    await createNotification({
      userId: request.submittedById,
      type: "STATUS_CHANGE",
      title: `Content Request Updated: ${request.eventName}`,
      body: `Status changed to ${body.status.replace(/_/g, " ").toLowerCase()}.`,
      link: `/requests/content/${id}`,
    });
  }

  return NextResponse.json(updated);
}

export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const request = await prisma.contentRequest.findUnique({
    where: { id },
    include: {
      submittedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
      assignedTo: { select: { id: true, name: true, avatarUrl: true } },
      thread: { include: { comments: { include: { author: { select: { id: true, name: true, avatarUrl: true } } } } } },
    },
  });

  if (!request || request.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(request);
}
