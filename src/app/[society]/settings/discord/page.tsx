import { DiscordWebhookSettings } from "@/components/settings/DiscordWebhookSettings";
import { PortfolioRoles } from "@/components/settings/PortfolioRoles";

export default async function DiscordSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  return (
    <div data-tour="settings-discord" className="space-y-6">
      <DiscordWebhookSettings societySlug={society} />
      <DiscordWebhookSettings societySlug={society} channel="events" />
      <PortfolioRoles societySlug={society} />
    </div>
  );
}
