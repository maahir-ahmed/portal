import { MemberImport } from "@/components/settings/MemberImport";

export default async function ImportMembersSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  return <MemberImport societySlug={society} />;
}
