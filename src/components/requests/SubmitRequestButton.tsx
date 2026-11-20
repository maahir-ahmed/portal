"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { offline } from "@/lib/utils";

// Moves the owner's own DRAFT event request to Submitted. The API allows exactly that
// transition for the owner and alerts the executives.
export function SubmitRequestButton({ societySlug, requestId }: { societySlug: string; requestId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const res = await fetch(`/api/societies/${societySlug}/content-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SUBMITTED" }),
    }).catch(offline);
    setLoading(false);
    if (res.ok) {
      toast.success("Request submitted");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to submit");
    }
  }

  return (
    <Button size="sm" onClick={submit} disabled={loading} className="gap-1.5 flex-shrink-0">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      Submit request
    </Button>
  );
}
