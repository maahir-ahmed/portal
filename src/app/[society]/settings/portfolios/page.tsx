import { PortfoliosManager } from "@/components/settings/PortfoliosManager";
import { TitlesManager } from "@/components/settings/TitlesManager";
import { requireExecPage } from "@/lib/pageAccess";

export default async function PortfoliosSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  await requireExecPage(society);
  return (
    <div className="space-y-6">
      <PortfoliosManager societySlug={society} />
      <TitlesManager societySlug={society} />
    </div>
  );
}
