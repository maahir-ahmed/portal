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
import { ImageUploadField } from "@/components/settings/ImageUploadField";
import { SECRETARIAL_ALLOWANCE } from "@/lib/printing";
import type { Society } from "@prisma/client";

export default function SettingsPage() {
  const params = useParams<{ society: string }>();
  const [saving, setSaving] = useState(false);
  const [society, setSociety] = useState<Society | null>(null);

  useEffect(() => {
    fetch(`/api/societies/${params.society}`)
      .then((r) => r.json())
      .then(setSociety);
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

        <Card data-tour="settings-ahegs">
          <CardHeader>
            <CardTitle className="text-base">AHEGS Year</CardTitle>
            <CardDescription>
              The year AHEGS is being collated for. Leave blank to follow the calendar year.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="ahegsYear">Current AHEGS year</Label>
            <Input
              id="ahegsYear"
              name="ahegsYear"
              type="number"
              min={2000}
              max={2100}
              placeholder={String(new Date().getFullYear())}
              defaultValue={society.ahegsYear ?? ""}
              className="max-w-[160px] tabnums"
            />
            <p className="text-xs text-muted-foreground">
              The AHEGS tab opens on this year, so a submission being prepared over the summer
              doesn&apos;t roll over to an empty one on 1 January.
            </p>
          </CardContent>
        </Card>

        <Card data-tour="settings-branding">
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
            <CardDescription>Customise your society&apos;s colours and logo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="primaryColor">Primary Colour</Label>
                <div className="flex items-center gap-2">
                  <input type="color" name="primaryColor" defaultValue={society.primaryColor} className="h-10 w-10 rounded border cursor-pointer" />
                  <Input name="primaryColorText" defaultValue={society.primaryColor} placeholder="#0052CC" className="flex-1" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondaryColor">Secondary Colour</Label>
                <div className="flex items-center gap-2">
                  <input type="color" name="secondaryColor" defaultValue={society.secondaryColor} className="h-10 w-10 rounded border cursor-pointer" />
                  <Input name="secondaryColorText" defaultValue={society.secondaryColor} placeholder="#00B8D9" className="flex-1" />
                </div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <ImageUploadField
                name="logoUrl"
                label="Logo"
                defaultValue={society.logoUrl}
                shape="square"
                hint="Square image (PNG with transparency works best)."
              />
              <ImageUploadField
                name="bannerUrl"
                label="Banner"
                defaultValue={society.bannerUrl}
                shape="wide"
                hint="Wide image shown across the top of your page."
              />
            </div>
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

      <PortfoliosManager societySlug={params.society} />
      <TitlesManager societySlug={params.society} />
      <RubricSettings societySlug={params.society} />
    </div>
  );
}
