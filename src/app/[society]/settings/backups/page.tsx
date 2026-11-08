import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { backupsEnabled } from "@/lib/debugTools";
import { Backups, Restore } from "@/components/settings/BackupsClient";

export default async function BackupsPage({ params }: { params: Promise<{ society: string }> }) {
  if (!backupsEnabled()) notFound();
  const { society } = await params;
  // The settings layout has already checked this is an executive of this society.
  const s = await prisma.society.findUnique({ where: { slug: society }, select: { name: true } });
  if (!s) notFound();
  const base = `/api/societies/${society}/backups`;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        The server also backs everything up by itself every night. Download one now and then and keep it somewhere
        else, so a dead server doesn&apos;t take your records with it. Moving to a new computer? Download a backup here,
        then choose <b>Restore a backup</b> when setting up the new one.
      </p>
      <Backups base={base} />
      <Restore base={base} societyName={s.name} />
    </div>
  );
}
