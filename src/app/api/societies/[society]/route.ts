import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  // Accept relative upload paths (/uploads/…) as well as full URLs.
  logoUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  website: z.string().url().nullable().optional(),
  facebookUrl: z.string().url().nullable().optional(),
  instagramUrl: z.string().url().nullable().optional(),
  discordUrl: z.string().url().nullable().optional(),
  linkedinUrl: z.string().url().nullable().optional(),
  secretarialTier: z.enum(["BRONZE", "SILVER", "GOLD"]).optional(),
}).partial();

export async function GET(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society);
  if (memErr) return memErr;

  // Explicit field list, never the whole row: rubricSessionId and
  // rubricUnionSessionId are credentials and must not leave the server. Their
  // configured/not-configured state is exposed by the rubric/credentials route.
  const s = await prisma.society.findUnique({
    where: { id: membership!.societyId },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      bannerUrl: true,
      primaryColor: true,
      secondaryColor: true,
      contactEmail: true,
      website: true,
      facebookUrl: true,
      instagramUrl: true,
      discordUrl: true,
      linkedinUrl: true,
      description: true,
      secretarialTier: true,
      rubricSocietyId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(s);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  try {
    // The settings form posts every field. Empty strings on the always-present
    // required fields (name, colours, tier) are dropped; on optional/nullable
    // fields an empty string means "clear it" → null (so e.g. removing the logo works).
    const ALWAYS_PRESENT = new Set(["name", "primaryColor", "secondaryColor", "secretarialTier"]);
    const raw = (await req.json()) as Record<string, unknown>;
    for (const k of Object.keys(raw)) {
      if (raw[k] === "") {
        if (ALWAYS_PRESENT.has(k)) delete raw[k];
        else raw[k] = null;
      }
    }
    const body = updateSchema.parse(raw);
    await prisma.society.update({
      where: { id: membership!.societyId },
      data: body,
    });

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "UPDATE",
      entityType: "Society",
      entityId: membership!.societyId,
    });

    // Same reason as GET: reply with the accepted changes, not the stored row.
    return NextResponse.json({ ok: true, ...body });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
