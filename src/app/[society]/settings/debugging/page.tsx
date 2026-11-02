import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { debugToolsEnabled } from "@/lib/debugTools";
import { DebugClient } from "@/components/settings/DebugClient";

export default async function DebuggingPage({ params }: { params: Promise<{ society: string }> }) {
  if (!debugToolsEnabled()) notFound();
  const { society } = await params;
  // The settings layout has already checked this is an executive of this society.
  const s = await prisma.society.findUnique({ where: { slug: society }, select: { name: true } });
  if (!s) notFound();
  return <DebugClient societySlug={society} societyName={s.name} />;
}
