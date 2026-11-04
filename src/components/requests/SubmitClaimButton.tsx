"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Send, Loader2 } from "lucide-react";
import { usePolicy } from "@/hooks/usePolicy";
import { offline } from "@/lib/utils";

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
  const [asking, setAsking] = useState(false);
  const rules = usePolicy(societySlug, "TREASURY");

  async function submit() {
    setAsking(false);
    setLoading(true);
    const res = await fetch(`/api/societies/${societySlug}/treasury/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REIMBURSEMENT_PENDING", ...(acknowledged ? {} : { acknowledgedRules: true }) }),
    }).catch(offline);
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
    <>
      <Button size="sm" onClick={() => (acknowledged ? submit() : setAsking(true))} disabled={loading} className="gap-1.5">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Submit for reimbursement
      </Button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reimbursement policy</DialogTitle>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {rules.map((rule, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber-600 flex-shrink-0">•</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(false)}>Cancel</Button>
            <Button onClick={submit}>I have read and understood the policy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
