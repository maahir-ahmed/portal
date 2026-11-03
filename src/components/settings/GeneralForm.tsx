"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Globe, Link2, Share2 } from "lucide-react";
import { YearCalendarSettings } from "@/components/settings/YearCalendarSettings";
import { ImageUploadField } from "@/components/settings/ImageUploadField";
import { SECRETARIAL_ALLOWANCE } from "@/lib/printing";
import { useModules } from "@/hooks/useModules";
import { TIMEZONES, formatDate } from "@/lib/utils";
import type { Society } from "@prisma/client";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// Settings > General, and the first step of the setup wizard, which shows only the
// basics (name, timezone, branding) and leaves the rest for Settings.
export function GeneralForm({
  societySlug,
  basicsOnly = false,
  onSaved,
  submitLabel = "Save Settings",
}: {
  societySlug: string;
  basicsOnly?: boolean;
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [society, setSociety] = useState<Society | null>(null);
  const [primaryColor, setPrimaryColor] = useState("");
  const modules = useModules(societySlug);

  useEffect(() => {
    fetch(`/api/societies/${societySlug}`)
      .then((r) => r.json())
      .then((data) => {
        setSociety(data);
        setPrimaryColor(data.primaryColor ?? "");
      });
  }, [societySlug]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    form.forEach((v, k) => { body[k] = v as string; });

    const res = await fetch(`/api/societies/${societySlug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (res.ok) {
      toast.success("Settings saved!");
      onSaved?.();
    } else {
      toast.error("Failed to save settings");
    }
  }

  if (!society) {
    return <div className="flex items-center justify-center h-32 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
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
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <select id="timezone" name="timezone" defaultValue={society.timezone} className={SELECT_CLASS}>
                {(TIMEZONES.includes(society.timezone) ? TIMEZONES : [society.timezone, ...TIMEZONES]).map((tz) => (
                  <option key={tz} value={tz}>{tz.replaceAll("_", " ")}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Times like &quot;submitted at&quot; show in this timezone.</p>
            </div>
          </CardContent>
        </Card>

        {!basicsOnly && modules?.printing !== false && (
          <Card data-tour="settings-tier">
            <CardHeader>
              <CardTitle className="text-base">Secretarial Allowance</CardTitle>
              <CardDescription>Your Arc club tier sets the printing budget for the year.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {society.arcMemberCount !== null ? (
                <p className="text-sm">
                  <strong>{society.secretarialTier.charAt(0) + society.secretarialTier.slice(1).toLowerCase()}</strong>{" "}
                  (${SECRETARIAL_ALLOWANCE[society.secretarialTier]}), from {society.arcMemberCount} active members on
                  Rubric{society.arcMemberCountAt && `, checked ${formatDate(society.arcMemberCountAt)}`}. Arc tiers:
                  Bronze 5 to 74 members, Silver 75 to 249, Gold 250 or more.
                </p>
              ) : (
                <>
                  <Label htmlFor="secretarialTier">Club Tier</Label>
                  <select
                    id="secretarialTier"
                    name="secretarialTier"
                    defaultValue={society.secretarialTier ?? "BRONZE"}
                    className={SELECT_CLASS}
                  >
                    {Object.entries(SECRETARIAL_ALLOWANCE).map(([tier, amount]) => (
                      <option key={tier} value={tier}>
                        {tier.charAt(0) + tier.slice(1).toLowerCase()} (${amount})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Connect Rubric to set this from your member count.</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

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

        {!basicsOnly && (
          <Card data-tour="settings-social">
            <CardHeader>
              <CardTitle className="text-base">Social Media & Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {([
                { name: "website", label: "Website", icon: Globe, placeholder: "https://yoursociety.org" },
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
        )}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
      </form>

      {!basicsOnly && <YearCalendarSettings societySlug={societySlug} />}
    </div>
  );
}
