"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";

// Moves a DRAFT claim into the payout queue. The owner may submit their own draft;
// the API enforces that transition (and alerts the execs). A draft saved without the
// policy ticked has to acknowledge it here, or the API refuses the submit.
export function SubmitClaimButton({
  societySlug,
  requestId,
  acknowledged,
}: {
  societySlug: string;
  requestId: string;
  acknowledged: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (
      !acknowledged &&
      !confirm(
        "Reimbursement policy:\n\n" +
          "• The spend was approved in the committee Discord before you bought it.\n" +
          "• No alcohol.\n" +
          "• No personal transport (Uber, taxi, fuel) unless approved in writing first.\n" +
          "• Claims more than 3 weeks after the purchase may not be reimbursed.\n" +
          "• Bond money only once it has been returned.\n\n" +
          "I have read and understood the reimbursement policy."
      )
    )
      return;
    setLoading(true);
    const res = await fetch(`/api/societies/${societySlug}/treasury/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REIMBURSEMENT_PENDING", ...(acknowledged ? {} : { acknowledgedRules: true }) }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Submitted for reimbursement");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to submit");
    }
  }

  return (
    <Button size="sm" onClick={submit} disabled={loading} className="gap-1.5">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      Submit for reimbursement
    </Button>
  );
}
