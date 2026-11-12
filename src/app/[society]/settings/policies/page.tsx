import { requireExecPage } from "@/lib/pageAccess";
import { PoliciesForm } from "@/components/settings/PoliciesForm";

export default async function PoliciesSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  await requireExecPage(society);
  return <PoliciesForm societySlug={society} />;
}
