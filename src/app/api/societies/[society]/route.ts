import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { MODULE_SELECT } from "@/lib/modules";
import { z } from "zod";

const UPLOADED_IMAGE = /^\/uploads\/[A-Za-z0-9-]+\.(png|jpe?g|gif|webp)$/;

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
  // Arrives as a string from the settings form; "" has already become null above.
  ahegsYear: z.coerce.number().int().min(2000).max(2100).nullable().optional(),
  // Settings > Features. Sent as JSON booleans, never through the general form.
  moduleEvents: z.boolean(),
  moduleRoomBookings: z.boolean(),
  modulePrinting: z.boolean(),
  moduleGrants: z.boolean(),
  moduleTicketing: z.boolean(),
  moduleBoard: z.boolean(),
  moduleAhegs: z.boolean(),
  treasuryMode: z.enum(["BUDGET", "TRANSACTIONS"]),
  timezone: z.string().refine(validTimeZone, "Unknown timezone"),
  // First-run setup: the step to resume at, and finishing it.
  setupStep: z.number().int().min(0).max(20),
  setupDone: z.literal(true),
}).partial();

function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

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
      arcMemberCount: true,
      arcMemberCountAt: true,
      ahegsYear: true,
      rubricSocietyId: true,
      ...MODULE_SELECT,
      timezone: true,
      setupStep: true,
      setupCompletedAt: true,
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
    const ALWAYS_PRESENT = new Set(["name", "primaryColor", "secondaryColor", "secretarialTier", "timezone"]);
    const raw = (await req.json()) as Record<string, unknown>;
    for (const k of Object.keys(raw)) {
      if (raw[k] === "") {
        if (ALWAYS_PRESENT.has(k)) delete raw[k];
        else raw[k] = null;
      }
    }
    const { setupDone, ...body } = updateSchema.parse(raw);

    // A logo is served to signed-out visitors (the login page shows it), so pointing it at
    // any other upload, a receipt say, would make that file public. A new value has to be
    // an uploaded image; the current value is always accepted, since the settings form
    // posts it back on every save.
    for (const key of ["logoUrl", "bannerUrl"] as const) {
      const value = body[key];
      if (!value) continue;
      const current = await prisma.society.findUnique({ where: { id: membership!.societyId }, select: { [key]: true } });
      if (value !== (current as Record<string, unknown> | null)?.[key] && !UPLOADED_IMAGE.test(value)) {
        return NextResponse.json({ error: "The logo has to be an image uploaded here" }, { status: 400 });
      }
    }
    await prisma.society.update({
      where: { id: membership!.societyId },
      data: { ...body, ...(setupDone ? { setupCompletedAt: new Date() } : {}) },
    });

    await createAuditLog({
      societyId: membership!.societyId,
      userId: session!.user.id,
      action: "UPDATE",
      entityType: "Society",
      entityId: membership!.societyId,
      metadata: { fields: [...Object.keys(body), ...(setupDone ? ["setupCompletedAt"] : [])].join(", ") },
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
