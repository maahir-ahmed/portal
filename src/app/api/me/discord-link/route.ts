import { NextResponse } from "next/server";
import { requireAuth, blockDemoAccountWrite } from "@/lib/api";
import { botEnabled, newLinkCode } from "@/lib/discordBot";

// A one-time code the member types into /link in the society's Discord server.
export async function POST() {
  const { session, error } = await requireAuth();
  if (error) return error;
  if (!botEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const demoBlocked = await blockDemoAccountWrite(session!.user.id);
  if (demoBlocked) return demoBlocked;
  return NextResponse.json({ code: await newLinkCode(session!.user.id) });
}
