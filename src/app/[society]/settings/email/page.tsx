import { EmailSettings } from "@/components/settings/EmailSettings";

export default async function EmailSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  return <EmailSettings societySlug={society} />;
}
