"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

interface Props {
  societySlug: string;
  requestId: string;
}

export function PrintingDecisionButtons({ societySlug, requestId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function decide(action: "approve" | "reject") {
    if (action === "reject" && !confirm("Reject this printing request?")) return;
    setBusy(action);
    const res = await fetch(`/api/societies/${societySlug}/printing/${requestId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (res.ok) {
      toast.success(action === "approve" ? "Approved, awaiting Arc submission (budget deducted)" : "Request rejected");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to update request");
    }
  }

  return (
    <div className="flex gap-2">
      <Button onClick={() => decide("approve")} disabled={busy !== null} className="gap-2">
        {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
        Approve
      </Button>
      <Button onClick={() => decide("reject")} disabled={busy !== null} variant="outline" className="gap-2 text-red-600 hover:text-red-700">
        {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
        Reject
      </Button>
    </div>
  );
}
