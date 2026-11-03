import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { requestUpdate, updateStatus } from "@/lib/updates";

// The version this portal runs, whether a newer release is out, and asking the server
// to install it at its next nightly check. Executives only: an update restarts the
// portal for everyone.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;
  return NextResponse.json(await updateStatus());
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ society: string }> }) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
  if (memErr) return memErr;

  const status = await updateStatus();
  if (!status.enabled) return NextResponse.json({ error: "Updates are managed elsewhere on this server" }, { status: 400 });
  if (!status.updaterRunning) {
    return NextResponse.json(
      { error: "The server's updater isn't running. On the server, run: ./portal autoupdate on" },
      { status: 409 }
    );
  }

  await requestUpdate(session!.user.id);
  await createAuditLog({
    societyId: membership!.societyId,
    userId: session!.user.id,
    action: "UPDATE",
    entityType: "AppUpdate",
    entityId: "app",
    metadata: { from: status.current, to: status.latest ?? "newest" },
  });
  return NextResponse.json({ ok: true });
}
