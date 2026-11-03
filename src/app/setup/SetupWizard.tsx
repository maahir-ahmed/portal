"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GeneralForm } from "@/components/settings/GeneralForm";
import { PortfoliosManager } from "@/components/settings/PortfoliosManager";
import { TitlesManager } from "@/components/settings/TitlesManager";
import { FeaturesForm } from "@/components/settings/FeaturesForm";
import { PoliciesForm } from "@/components/settings/PoliciesForm";
import { DiscordWebhookSettings } from "@/components/settings/DiscordWebhookSettings";
import { MemberImport } from "@/components/settings/MemberImport";

// First-run setup, after the first account exists. Every step is the same component
// as its Settings tab, so anything skipped or got wrong here is fixed there later.
// "form" steps save with their own button, which also moves on; "live" steps save
// each change as it is made, so the footer just moves on.
type Step = {
  title: string;
  blurb: string;
  kind: "form" | "live";
  body: (slug: string, next: () => void) => React.ReactNode;
};

const STEPS: Step[] = [
  {
    title: "Your society",
    blurb: "The basics. Your logo shows in the sidebar and on the sign-in page.",
    kind: "form",
    body: (slug, next) => <GeneralForm societySlug={slug} basicsOnly onSaved={next} submitLabel="Save and continue" />,
  },
  {
    title: "Portfolios",
    blurb: "Optional. Add the ones you have now; you can change them any time.",
    kind: "live",
    body: (slug) => (
      <div className="space-y-6">
        <PortfoliosManager societySlug={slug} />
        <TitlesManager societySlug={slug} />
      </div>
    ),
  },
  {
    title: "Features",
    blurb: "Switch off anything your society won't use. Nothing is deleted, and you can switch it back on later.",
    kind: "form",
    body: (slug, next) => <FeaturesForm societySlug={slug} onSaved={next} />,
  },
  {
    title: "Rules on request forms",
    blurb: "Optional. Anything your members should agree to before they submit a request.",
    kind: "form",
    body: (slug, next) => <PoliciesForm societySlug={slug} onSaved={next} />,
  },
  {
    title: "Members",
    blurb: "Optional. Bring in the rest of your committee from a spreadsheet, or add people one at a time later.",
    kind: "live",
    body: (slug) => <MemberImport societySlug={slug} />,
  },
  {
    title: "Discord",
    blurb: "Optional. Post new requests into your committee's Discord channels.",
    kind: "live",
    body: (slug) => (
      <div className="space-y-6">
        <DiscordWebhookSettings societySlug={slug} />
        <DiscordWebhookSettings societySlug={slug} channel="events" />
      </div>
    ),
  },
];

export function SetupWizard({ societySlug, initialStep }: { societySlug: string; initialStep: number }) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(initialStep, STEPS.length - 1));
  const [busy, setBusy] = useState(false);
  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  async function save(body: Record<string, unknown>) {
    const res = await fetch(`/api/societies/${societySlug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) toast.error("Couldn't save your progress. Check your connection and try again.");
    return res.ok;
  }

  async function go(to: number) {
    setBusy(true);
    const ok = await save({ setupStep: to });
    setBusy(false);
    if (!ok) return;
    setStep(to);
    window.scrollTo({ top: 0 });
  }

  async function finish() {
    setBusy(true);
    if (await save({ setupDone: true })) router.push(`/${societySlug}/dashboard`);
    else setBusy(false);
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Setup steps">
          {STEPS.map((s, i) => (
            <li key={s.title} aria-current={i === step ? "step" : undefined} className={i === step ? "font-semibold text-foreground" : ""}>
              {i + 1}. {s.title}
            </li>
          ))}
        </ol>
        <div>
          <p className="text-sm text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </p>
          <h1 className="text-2xl font-bold">{current.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{current.blurb}</p>
        </div>

        {/* keyed by step, so each step's form loads fresh */}
        <div key={step}>{current.body(societySlug, () => (last ? finish() : go(step + 1)))}</div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <Button variant="ghost" onClick={() => go(step - 1)} disabled={busy || step === 0}>
            Back
          </Button>
          <Button
            variant={current.kind === "form" && !last ? "outline" : "default"}
            onClick={() => (last ? finish() : go(step + 1))}
            disabled={busy}
          >
            {last ? "Finish" : current.kind === "form" ? "Skip for now" : "Continue"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Everything here is also in Settings, to change later.</p>
      </div>
    </div>
  );
}
