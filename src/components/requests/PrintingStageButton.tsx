"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { offline } from "@/lib/utils";

const STAGES = {
  mark_submitted: { label: "Mark submitted", success: "Marked as submitted to Arc" },
  mark_ready: { label: "Ready for pickup", success: "Marked as ready for pickup" },
} as const;

interface Props {
  societySlug: string;
  requestId: string;
  action: keyof typeof STAGES;
}

// Advances a printing request one lifecycle stage (exec-only actions).
export function PrintingStageButton({ societySlug, requestId, action }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function advance() {
    setBusy(true);
    try {
      const res = await fetch(`/api/societies/${societySlug}/printing/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).catch(offline);
      if (res.ok) {
        toast.success(STAGES[action].success);
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Failed to update request");
      }
    } catch {
      toast.error("Failed to update request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={advance} disabled={busy} size="sm" className="gap-1.5 text-xs">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
      {STAGES[action].label}
    </Button>
  );
}
