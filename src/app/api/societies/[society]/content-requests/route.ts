import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { notifyExecs } from "@/lib/notifications";
import { z } from "zod";
import type { ContentRequestStatus } from "@prisma/client";

const createSchema = z.object({
  eventName: z.string().min(1).max(200),
  startDate: z.string().datetime({ offset: true }).or(z.string()),
  endDate: z.string().nullable().optional(),
  location: z.string().min(1).max(200),
  keyPoints: z.string().min(1),
  deadline: z.string().datetime({ offset: true }).or(z.string()),
  bannerRequired: z.boolean().default(false),
  blurbRequired: z.boolean().default(false),
  rubricRequired: z.boolean().default(false),
  otherNotes: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "SUBMITTED"]).default("SUBMITTED"),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const canSeeAll = membership!.role === "EXECUTIVE" || membership!.role === "DIRECTOR";

  const requests = await prisma.contentRequest.findMany({
    where: {
      societyId: membership!.societyId,
      ...(status ? { status: status as ContentRequestStatus } : {}),
      ...(!canSeeAll ? { submittedById: session!.user.id } : {}),
    },
    include: {
      submittedBy: { select: { id: true, name: true, avatarUrl: true } },
      assignedTo: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(requests);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  try {
    const body = createSchema.parse(await req.json());

    const request = await prisma.contentRequest.create({
      data: {
        societyId: membership!.societyId,
        submittedById: session!.user.id,
        eventName: body.eventName,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        location: body.location,
        keyPoints: body.keyPoints,
        deadline: new Date(body.deadline),
        bannerRequired: body.bannerRequired,
        blurbRequired: body.blurbRequired,
        rubricRequired: body.rubricRequired,
        otherNotes: body.otherNotes,
        status: body.status,
      },
    });

    // Create discussion thread
    await prisma.thread.create({ data: { contentRequestId: request.id } });

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "CREATE",
      entityType: "ContentRequest",
      entityId: request.id,
    });

    if (body.status === "SUBMITTED") {
      await notifyExecs(
        membership!.societyId,
        "APPROVAL_REQUIRED",
        `New Content Request: ${body.eventName}`,
        `${session!.user.name} submitted a new content request.`,
        `/requests/content/${request.id}`
      );

      if (body.rubricRequired) {
        await notifyExecs(
          membership!.societyId,
          "EXECUTIVE_ACTION_REQUIRED",
          `Rubric Event Required: ${body.eventName}`,
          "This content request requires an executive to create a Rubric event and attach the link/QR code.",
          `/requests/content/${request.id}`
        );
      }
    }

    return NextResponse.json(request, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
