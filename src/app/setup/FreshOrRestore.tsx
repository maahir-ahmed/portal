"use client";

import { useState } from "react";
import { ArchiveRestore, Sparkles } from "lucide-react";
import { Restore } from "@/components/settings/BackupsClient";

// The first question on a fresh portal: start a new society, or bring one over from
// another computer with a backup of it (src/lib/setup.ts, setupRestoreOk).
export function FreshOrRestore({ token, canRestore, children }: { token: string; canRestore: boolean; children: React.ReactNode }) {
  const [choice, setChoice] = useState<"fresh" | "restore" | null>(canRestore ? null : "fresh");

  if (choice === "fresh") return <>{children}</>;
  if (choice === "restore") {
    return (
      <div className="space-y-3">
        <Restore base="/api/setup/backup" setupToken={token} />
        <button type="button" onClick={() => setChoice(null)} className="text-sm text-muted-foreground underline underline-offset-2">
          Back
        </button>
      </div>
    );
  }

  const option = (key: "fresh" | "restore", Icon: typeof Sparkles, title: string, detail: string) => (
    <button
      type="button"
      onClick={() => setChoice(key)}
      className="flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-left hover:bg-secondary/50"
    >
      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
  return (
    <div className="space-y-3">
      {option("fresh", Sparkles, "Start fresh", "Set up a new portal for your society, starting with your account.")}
      {option(
        "restore",
        ArchiveRestore,
        "Restore a backup",
        "Moving from another computer? Bring everything over: members, requests, settings and uploaded files."
      )}
    </div>
  );
}
