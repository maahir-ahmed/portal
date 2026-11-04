"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MODULES_CHANGED } from "@/hooks/useModules";
import type { ModuleColumns } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { offline } from "@/lib/utils";

type Toggle = Exclude<keyof ModuleColumns, "treasuryMode">;

// Asked as plain questions, because whoever sets this up may never have seen the app.
// Shared by Settings > Features and the first-run setup.
const QUESTIONS: { key: Toggle; question: string; hint: string }[] = [
  {
    key: "moduleEvents",
    question: "Do members ask for help promoting events (posters, blurbs)?",
    hint: "Events & content requests: members submit an event and your marketing team makes the content for it.",
  },
  {
    key: "moduleRoomBookings",
    question: "Do you book rooms through your student union?",
    hint: "Room bookings: members ask for a room and an exec lodges it. Written for UNSW's Arc, including its seven-day rule.",
  },
  {
    key: "modulePrinting",
    question: "Do you use your student union's printing allowance?",
    hint: "Printing: members send print jobs for exec approval, costed against Arc's club tiers.",
  },
  {
    key: "moduleTicketing",
    question: "Do you sell tickets or manage members on Rubric?",
    hint: "Rubric portal: events, ticket sales, members and settlements from hellorubric.com.",
  },
  {
    key: "moduleGrants",
    question: "Do you claim activity grants for your events?",
    hint: "Activity grants: a countdown in the exec queue for each event's Arc grant claim. Needs the Rubric portal.",
  },
  {
    key: "moduleAhegs",
    question: "Do you need AHEGS reporting?",
    hint: "AHEGS: logs committee meetings and hours, and fills in Arc's recognition templates at the end of the year.",
  },
  {
    key: "moduleBoard",
    question: "Would your exec team like a shared to-do board?",
    hint: "Board: a simple to do, doing, done board for executives.",
  },
];

export function FeaturesForm({ societySlug, onSaved }: { societySlug: string; onSaved?: () => void }) {
  const [values, setValues] = useState<ModuleColumns | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/societies/${societySlug}`)
      .then((r) => r.json())
      .then((s: ModuleColumns) =>
        setValues({
          moduleEvents: s.moduleEvents,
          moduleRoomBookings: s.moduleRoomBookings,
          modulePrinting: s.modulePrinting,
          moduleGrants: s.moduleGrants,
          moduleTicketing: s.moduleTicketing,
          moduleBoard: s.moduleBoard,
          moduleAhegs: s.moduleAhegs,
          treasuryMode: s.treasuryMode,
        })
      );
  }, [societySlug]);

  async function save() {
    if (!values) return;
    setSaving(true);
    const res = await fetch(`/api/societies/${societySlug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }).catch(offline);
    setSaving(false);
    if (!res.ok) {
      toast.error("Couldn't save. Try again.");
      return;
    }
    toast.success("Saved");
    window.dispatchEvent(new Event(MODULES_CHANGED));
    onSaved?.();
  }

  if (!values) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const set = (patch: Partial<ModuleColumns>) => setValues({ ...values, ...patch });

  return (
    <div className="space-y-6">
      <Card data-tour="settings-features">
        <CardHeader>
          <CardTitle className="text-base">What does your society need?</CardTitle>
          <CardDescription>
            Anything you switch off disappears from the menu. Nothing is deleted, so switching it back on brings
            everything back.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {QUESTIONS.map((q) => (
            <label key={q.key} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-secondary/50">
              <input
                type="checkbox"
                checked={values[q.key]}
                onChange={(e) => set({ [q.key]: e.target.checked })}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{q.question}</span>
                <span className="block text-xs text-muted-foreground">{q.hint}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Money</CardTitle>
          <CardDescription>
            Will you plan spending with a budget, or just record transactions as they happen?
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {([
            ["BUDGET", "Plan with a budget", "Set a budget for each area every year and see what's left as claims come in."],
            ["TRANSACTIONS", "Just record transactions", "Members claim money back and execs pay it out. No budget to set."],
          ] as const).map(([mode, title, hint]) => (
            <label
              key={mode}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 cursor-pointer",
                values.treasuryMode === mode ? "border-foreground bg-secondary/50" : "hover:bg-secondary/50"
              )}
            >
              <input
                type="radio"
                name="treasuryMode"
                checked={values.treasuryMode === mode}
                onChange={() => set({ treasuryMode: mode })}
                className="mt-0.5 h-4 w-4 flex-shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
