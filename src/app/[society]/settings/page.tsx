"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Globe, Link2, Share2 } from "lucide-react";
import { TitlesManager } from "@/components/settings/TitlesManager";
import { PortfoliosManager } from "@/components/settings/PortfoliosManager";
import { RubricSettings } from "@/components/settings/RubricSettings";
import { DiscordWebhookSettings } from "@/components/settings/DiscordWebhookSettings";
import { YearCalendarSettings } from "@/components/settings/YearCalendarSettings";
import { ImageUploadField } from "@/components/settings/ImageUploadField";
import { SECRETARIAL_ALLOWANCE } from "@/lib/printing";
import type { Society } from "@prisma/client";

export default function SettingsPage() {
  const params = useParams<{ society: string }>();
  const [saving, setSaving] = useState(false);
  const [society, setSociety] = useState<Society | null>(null);
  const [primaryColor, setPrimaryColor] = useState("");

  useEffect(() => {
    fetch(`/api/societies/${params.society}`)
      .then((r) => r.json())
      .then((data) => {
        setSociety(data);
        setPrimaryColor(data.primaryColor ?? "");
      });
  }, [params.society]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    form.forEach((v, k) => { body[k] = v as string; });

    const res = await fetch(`/api/societies/${params.society}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (res.ok) {
      toast.success("Settings saved!");
    } else {
      toast.error("Failed to save settings");
    }
  }

  if (!society) {
    return <div className="flex items-center justify-center h-32 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Society Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Customise your society&apos;s profile</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card data-tour="settings-general">
          <CardHeader>
            <CardTitle className="text-base">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Society Name *</Label>
              <Input id="name" name="name" defaultValue={society.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" defaultValue={society.description ?? ""} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input id="contactEmail" name="contactEmail" type="email" defaultValue={society.contactEmail ?? ""} />
            </div>
          </CardContent>
        </Card>

        <Card data-tour="settings-tier">
          <CardHeader>
            <CardTitle className="text-base">Secretarial Allowance</CardTitle>
            <CardDescription>Your Arc club tier sets the printing budget for the year.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="secretarialTier">Club Tier</Label>
            <select
              id="secretarialTier"
              name="secretarialTier"
              defaultValue={society.secretarialTier ?? "BRONZE"}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {Object.entries(SECRETARIAL_ALLOWANCE).map(([tier, amount]) => (
                <option key={tier} value={tier}>
                  {tier.charAt(0) + tier.slice(1).toLowerCase()} (${amount})
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        <Card data-tour="settings-branding">
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
            <CardDescription>Your society&apos;s colour and logo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Only the primary colour and logo are shown anywhere (the sidebar). The
                secondary colour and banner were saved but never displayed, so they're
                no longer offered; their columns stay in the schema. */}
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Primary Colour</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick primary colour"
                  value={/^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : "#000000"}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-10 rounded border cursor-pointer"
                />
                <Input
                  id="primaryColor"
                  name="primaryColor"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  pattern="#[0-9a-fA-F]{6}"
                  title="A hex colour like #0052CC"
                  placeholder="#0052CC"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">Fills the sidebar tile when there&apos;s no logo.</p>
            </div>
            <ImageUploadField
              name="logoUrl"
              label="Logo"
              defaultValue={society.logoUrl}
              shape="square"
              hint="Square image (PNG with transparency works best). Shows in the sidebar after you next sign in."
            />
          </CardContent>
        </Card>

        <Card data-tour="settings-social">
          <CardHeader>
            <CardTitle className="text-base">Social Media & Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {([
              { name: "website", label: "Website", icon: Globe, placeholder: "https://secsoc.unsw.edu.au" },
              { name: "facebookUrl", label: "Facebook", icon: Share2, placeholder: "https://facebook.com/..." },
              { name: "instagramUrl", label: "Instagram", icon: Share2, placeholder: "https://instagram.com/..." },
              { name: "discordUrl", label: "Discord", icon: Link2, placeholder: "https://discord.gg/..." },
              { name: "linkedinUrl", label: "LinkedIn", icon: Link2, placeholder: "https://linkedin.com/company/..." },
            ] as const).map(({ name, label, icon: Icon, placeholder }) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={name} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" /> {label}
                </Label>
                <Input id={name} name={name} type="url" defaultValue={society[name] ?? ""} placeholder={placeholder} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save Settings"}
        </Button>
      </form>

      <YearCalendarSettings societySlug={params.society} />

      <PortfoliosManager societySlug={params.society} />
      <TitlesManager societySlug={params.society} />
      <RubricSettings societySlug={params.society} />

      <DiscordWebhookSettings societySlug={params.society} />
    </div>
  );
}
