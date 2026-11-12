import { MemberImport } from "@/components/settings/MemberImport";
import { requireExecPage } from "@/lib/pageAccess";

export default async function ImportMembersSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  await requireExecPage(society);
  return <MemberImport societySlug={society} />;
}
