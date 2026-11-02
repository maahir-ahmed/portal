import { GeneralForm } from "@/components/settings/GeneralForm";

export default async function GeneralSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  return <GeneralForm societySlug={society} />;
}
