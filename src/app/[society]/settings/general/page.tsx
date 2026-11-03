import { GeneralForm } from "@/components/settings/GeneralForm";
import { UpdatesCard } from "@/components/settings/UpdatesCard";

export default async function GeneralSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  return (
    <div className="space-y-6">
      <GeneralForm societySlug={society} />
      <UpdatesCard societySlug={society} />
    </div>
  );
}
