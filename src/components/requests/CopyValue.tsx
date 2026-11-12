"use client";

import { copyText } from "@/lib/clientApi";
import { Copy } from "lucide-react";

// One payout detail as a button: shows "Label value", copies only the value, so each
// field pastes cleanly into its own box in a banking app.
export function CopyValue({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      onClick={() => copyText(value, label.toLowerCase())}
      title={`Copy ${label.toLowerCase()}`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs hover:border-foreground/20 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground tabnums">{value}</span>
      <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}
