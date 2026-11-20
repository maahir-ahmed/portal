import { EmailSettings } from "@/components/settings/EmailSettings";
import { requireExecPage } from "@/lib/pageAccess";

export default async function EmailSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  await requireExecPage(society);
  return <EmailSettings societySlug={society} />;
}
