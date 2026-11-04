"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useModules } from "@/hooks/useModules";
import { BASE_POLICY, POLICY_KINDS, type PolicyKind } from "@/lib/policies";
import { offline } from "@/lib/utils";

// Settings > Policies, and the first-run setup's policy step. The base rules are
// shown read-only for context; only the society's own lines are editable.
export function PoliciesForm({
  societySlug,
  onSaved,
  submitLabel = "Save",
}: {
  societySlug: string;
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const modules = useModules(societySlug);
  const [saved, setSaved] = useState<Record<string, string> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/societies/${societySlug}/policies`)
      .then((r) => r.json())
      .then((a: Record<string, string>) => {
        setSaved(a);
        setDraft(a);
      });
  }, [societySlug]);

  async function save() {
    if (!saved) return;
    const changed = POLICY_KINDS.filter(({ kind }) => (draft[kind] ?? "") !== (saved[kind] ?? ""));
    setSaving(true);
    for (const { kind } of changed) {
      const res = await fetch(`/api/societies/${societySlug}/policies`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, text: draft[kind] ?? "" }),
      }).catch(offline);
      if (!res.ok) {
        setSaving(false);
        toast.error("Couldn't save. Try again.");
        return;
      }
    }
    setSaving(false);
    setSaved({ ...draft });
    toast.success("Saved");
    onSaved?.();
  }

  if (!saved || !modules) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const shown = POLICY_KINDS.filter((k) => !k.module || modules[k.module]);

  return (
    <div data-tour="settings-policies" className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Each request form shows a few rules before someone submits. Add your society&apos;s own here, one per
        line, for example &quot;Get approval in the exec Discord before buying anything.&quot; They show above
        the standard rules, and members agree to both together.
      </p>
      {shown.map(({ kind, label }) => (
        <Card key={kind}>
          <CardHeader>
            <CardTitle className="text-base">{label}</CardTitle>
            {BASE_POLICY[kind as PolicyKind].length > 0 ? (
              <CardDescription>Standard rules, always shown:</CardDescription>
            ) : (
              <CardDescription>No standard rules. Anything you add here is all that shows.</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {BASE_POLICY[kind as PolicyKind].length > 0 && (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {BASE_POLICY[kind as PolicyKind].map((rule, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="flex-shrink-0">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            )}
            <Textarea
              aria-label={`${label}: your society's rules`}
              placeholder="Your society's rules, one per line (optional)"
              value={draft[kind] ?? ""}
              onChange={(e) => setDraft({ ...draft, [kind]: e.target.value })}
              rows={3}
            />
          </CardContent>
        </Card>
      ))}
      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}
