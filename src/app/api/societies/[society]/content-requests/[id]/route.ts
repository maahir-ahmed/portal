import { NextRequest, NextResponse } from "next/server";
import { ContentRequestStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { syncEventToDiscord } from "@/lib/discordEvents";
import { statusLabel, isPlausibleDate } from "@/lib/utils";


// What the edit form, the status picker and the marketing panel send. Types only, with
// limits far past any real form: anything the code already ignored ("" for a date, an
// unknown key) is still ignored, but a wrong type or an impossible date is a 400 here
// instead of a Prisma error and a 500 further down.
const date = z.string().refine((s) => s === "" || isPlausibleDate(s), "Enter a real date");
const text = (max: number) => z.string().max(max).nullable();
const patchSchema = z
  .object({
    status: z.enum(ContentRequestStatus),
    activityGrantStatus: z.string(),
    eventName: z.string().max(1000),
    startDate: date.nullable(),
    endDate: date.nullable(),
    deadline: date.nullable(),
    location: z.string().max(1000),
    keyPoints: z.string().max(20000),
    portfolioId: text(100),
    bannerRequired: z.boolean(),
    blurbRequired: z.boolean(),
    rubricRequired: z.boolean(),
    otherNotes: text(20000),
    finishedBlurb: text(20000),
    addDeliverables: z.array(z.object({ fileName: z.string().max(500).optional(), fileUrl: z.string().max(2000).optional() })),
    removeDeliverableIds: z.array(z.string()),
  })
  .partial();

type Params = { society: string; id: string };

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society, id } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  // Validated above; typed loosely as before, so the code below treats every value
  // exactly as it did when the body was unchecked JSON.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = parsed.data;

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

  if (
    canEditCore &&
    body.portfolioId &&
    !(await prisma.portfolio.count({ where: { id: String(body.portfolioId), societyId: membership!.societyId } }))
  ) {
    return NextResponse.json({ error: "Unknown portfolio" }, { status: 400 });
  }

  // Only a manager's status is applied, so only theirs is announced: anyone else's
  // would otherwise be logged, notified and posted to Discord without having happened.
  const statusSent = canManage && body.status ? body.status : null;
  const statusChanged = !!statusSent && statusSent !== request.status;

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
      ...(canEditCore && body.portfolioId !== undefined ? { portfolioId: body.portfolioId ? String(body.portfolioId) : null } : {}),
      ...(canEditCore && typeof body.bannerRequired === "boolean" ? { bannerRequired: body.bannerRequired } : {}),
      ...(canEditCore && typeof body.blurbRequired === "boolean" ? { blurbRequired: body.blurbRequired } : {}),
      ...(canEditCore && typeof body.rubricRequired === "boolean" ? { rubricRequired: body.rubricRequired } : {}),
      ...(canEditCore && body.otherNotes !== undefined ? { otherNotes: body.otherNotes || null } : {}),
      ...(isMarketing && body.finishedBlurb !== undefined ? { finishedBlurb: body.finishedBlurb || null } : {}),
      // blurbDone is derived, not sent: handing in a blurb is what "done" means, and
      // clearing it undoes that. Same idea as bannerDone below.
      ...(isMarketing && body.finishedBlurb !== undefined
        ? { blurbDone: String(body.finishedBlurb ?? "").trim().length > 0 }
        : {}),
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

  // bannerDone follows whether any graphic is actually attached, counted after the
  // adds and removes above rather than taken from the client. Uploading is what marks
  // it done; deleting the last file marks it undone again.
  if (isMarketing && (body.addDeliverables !== undefined || body.removeDeliverableIds !== undefined)) {
    const files = await prisma.contentDeliverable.count({ where: { contentRequestId: id } });
    await prisma.contentRequest.update({ where: { id }, data: { bannerDone: files > 0 } });
  }

  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: statusSent ? "STATUS_CHANGE" : "UPDATE",
    entityType: "ContentRequest",
    entityId: id,
    ...(statusSent ? { metadata: { from: request.status, to: statusSent } } : {}),
  });

  if (statusChanged) {
    await createNotification({
      userId: request.submittedById,
      type: "STATUS_CHANGE",
      title: `Content Request Updated: ${request.eventName}`,
      body: `Status changed to ${statusSent!.replace(/_/g, " ").toLowerCase()}.`,
      link: `/requests/content/${id}`,
    });
  }

  // Edits the marketing channel's message in place, or posts it if this edit is the
  // one that submits a draft, and says what changed in its thread.
  await syncEventToDiscord(
    id,
    statusChanged
      ? `Status changed to **${statusLabel(statusSent!)}** by ${session!.user.name}.`
      : `${session!.user.name} updated the request.`
  );

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
      thread: {
        include: {
          comments: {
            // Same rule as the detail page: internal notes are for executives only.
            where: membership!.role === "EXECUTIVE" ? {} : { isInternal: false },
            include: { author: { select: { id: true, name: true, avatarUrl: true } } },
          },
        },
      },
    },
  });

  if (!request || request.societyId !== membership!.societyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(request);
}
