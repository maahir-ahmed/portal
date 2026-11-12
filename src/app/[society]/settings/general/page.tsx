import { GeneralForm } from "@/components/settings/GeneralForm";
import { UpdatesCard } from "@/components/settings/UpdatesCard";
import { requireExecPage } from "@/lib/pageAccess";

export default async function GeneralSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  await requireExecPage(society);
  return (
    <div className="space-y-6">
      <GeneralForm societySlug={society} />
      <UpdatesCard societySlug={society} />
    </div>
  );
}
