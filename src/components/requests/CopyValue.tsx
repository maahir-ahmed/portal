"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";

// One payout detail as a button: shows "Label value", copies only the value, so each
// field pastes cleanly into its own box in a banking app.
export function CopyValue({ label, value }: { label: string; value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Copied ${label.toLowerCase()}`, { duration: 1500 });
    } catch {
      toast.error("Copy failed: select and copy manually");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${label.toLowerCase()}`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs hover:border-foreground/20 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground tabnums">{value}</span>
      <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}
