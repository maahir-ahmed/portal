import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updaterCheckIn, updatesEnabled, validUpdateToken } from "@/lib/updates";

// The server's `./portal tick` checking in (src/lib/updates.ts). Authenticated by
// UPDATE_TOKEN from portal.env, not a session, so the proxy lets it through.
const body = z
  .object({
    result: z.enum(["ok", "failed", "rolled_back"]),
    detail: z.string().max(500).optional(),
    version: z.string().max(100).optional(),
  })
  .partial();

export async function POST(req: NextRequest) {
  if (!updatesEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!validUpdateToken(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { result, detail, version } = parsed.data;
  return NextResponse.json(await updaterCheckIn(result ? { result, detail, version } : undefined));
}
