import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api";

export async function GET(req: NextRequest) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  // A limit that isn't a positive whole number falls back to 20: NaN made Prisma throw,
  // and a negative take would page backwards.
  const asked = Number(searchParams.get("limit") ?? 20);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 50) : 20;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session!.user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId: session!.user.id, isRead: false },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
