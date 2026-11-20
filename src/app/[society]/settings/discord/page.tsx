import { DiscordWebhookSettings } from "@/components/settings/DiscordWebhookSettings";
import { PortfolioRoles } from "@/components/settings/PortfolioRoles";
import { DiscordBot, DiscordReminders } from "@/components/settings/DiscordServerSettings";
import { requireExecPage } from "@/lib/pageAccess";

export default async function DiscordSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  await requireExecPage(society);
  return (
    <div data-tour="settings-discord" className="space-y-6">
      <DiscordWebhookSettings societySlug={society} />
      <DiscordWebhookSettings societySlug={society} channel="events" />
      <DiscordReminders societySlug={society} />
      <PortfolioRoles societySlug={society} />
      <DiscordBot societySlug={society} />
    </div>
  );
}
