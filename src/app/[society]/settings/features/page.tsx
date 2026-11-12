import { requireExecPage } from "@/lib/pageAccess";
import { FeaturesClient } from "./FeaturesClient";

export default async function FeaturesSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  await requireExecPage(society);
  return <FeaturesClient societySlug={society} />;
}
