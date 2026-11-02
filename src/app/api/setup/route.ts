import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { setupTokenOk } from "@/lib/setup";
import { generateSlug } from "@/lib/utils";

const schema = z.object({
  token: z.string(),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  societyName: z.string().trim().min(2).max(100),
});

// Creates the first account and the society on a fresh stack (see src/lib/setup.ts).
// Public, like the login form: the setup token is the credential.
export async function POST(req: NextRequest) {
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : undefined;
    return NextResponse.json({ error: msg ?? "Bad request" }, { status: 400 });
  }
  if (!setupTokenOk(body.token)) {
    return NextResponse.json({ error: "That setup link isn't right. Use the one the installer printed." }, { status: 403 });
  }

  const passwordHash = await hashPassword(body.password);
  const slug = process.env.SOCIETY_SLUG || generateSlug(body.societyName);
  try {
    const user = await prisma.$transaction(
      async (tx) => {
        // Checked inside the transaction: of two people racing the same link, one wins.
        if ((await tx.user.count()) > 0) throw new Error("taken");
        const society = await tx.society.upsert({
          where: { slug },
          update: {},
          create: { name: body.societyName, slug },
        });
        return tx.user.create({
          data: {
            name: body.name,
            email: body.email,
            passwordHash,
            memberships: { create: { societyId: society.id, role: "EXECUTIVE", title: "President" } },
          },
          include: { memberships: { select: { societyId: true } } },
        });
      },
      { isolationLevel: "Serializable" }
    );
    await createAuditLog({
      societyId: user.memberships[0].societyId,
      userId: user.id,
      action: "CREATE",
      entityType: "Society",
      entityId: user.memberships[0].societyId,
      metadata: { setup: "first account", email: body.email },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    // "taken", or the losing side of the race: a write conflict (P2034) or the email (P2002).
    const code = (err as { code?: string }).code;
    if ((err as Error).message === "taken" || code === "P2034" || code === "P2002") {
      return NextResponse.json({ error: "This portal already has an account. Sign in instead." }, { status: 409 });
    }
    console.error("[setup] first account failed:", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
