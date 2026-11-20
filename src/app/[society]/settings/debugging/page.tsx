import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { debugToolsEnabled } from "@/lib/debugTools";
import { DebugClient } from "@/components/settings/DebugClient";
import { requireExecPage } from "@/lib/pageAccess";

export default async function DebuggingPage({ params }: { params: Promise<{ society: string }> }) {
  if (!debugToolsEnabled()) notFound();
  const { society } = await params;
  await requireExecPage(society);
  const s = await prisma.society.findUnique({ where: { slug: society }, select: { name: true } });
  if (!s) notFound();
  return <DebugClient societySlug={society} societyName={s.name} />;
}
