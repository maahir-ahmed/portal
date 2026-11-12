import { RubricSettings } from "@/components/settings/RubricSettings";
import { requireExecPage } from "@/lib/pageAccess";

export default async function RubricSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  await requireExecPage(society);
  return <RubricSettings societySlug={society} />;
}
