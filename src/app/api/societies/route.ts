import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api";
import { generateSlug } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  contactEmail: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  // Founding a society makes the caller its executive, so this is only open where the
  // setup page offers it: a multi-society stack, to someone not already an executive.
  // On a single-society stack (every hosted and self-hosted one) any signed-in member
  // could otherwise make themselves an executive of a new society and reach the
  // instance-wide tools that only an executive gets.
  if (process.env.SOCIETY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isExecSomewhere = await prisma.societyMembership.count({
    where: { userId: session!.user.id, isActive: true, role: "EXECUTIVE" },
  });
  if (isExecSomewhere) return NextResponse.json({ error: "You already run a society" }, { status: 403 });

  try {
    const body = schema.parse(await req.json());
    let slug = generateSlug(body.name);

    // Ensure uniqueness
    const existing = await prisma.society.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }

    const society = await prisma.society.create({
      data: {
        name: body.name,
        slug,
        description: body.description,
        contactEmail: body.contactEmail,
        memberships: {
          create: {
            userId: session!.user.id,
            role: "EXECUTIVE",
            title: "Founder",
          },
        },
      },
    });

    return NextResponse.json(society, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
