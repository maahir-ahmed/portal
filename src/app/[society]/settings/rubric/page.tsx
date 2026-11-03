import { RubricSettings } from "@/components/settings/RubricSettings";

export default async function RubricSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  return <RubricSettings societySlug={society} />;
}
