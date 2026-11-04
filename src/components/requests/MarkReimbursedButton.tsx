"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Banknote } from "lucide-react";
import { offline } from "@/lib/utils";

export function MarkReimbursedButton({
  societySlug,
  requestId,
  amount,
  account,
}: {
  societySlug: string;
  requestId: string;
  amount: number;
  // The row the claim is actually linked to, not the submitter's current default —
  // the exec is confirming the details they are about to transfer money to.
  account: { accountName: string; bsb: string; accountNumber: string; payId?: string | null } | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    const payee = account
      ? `${account.accountName}\nBSB ${account.bsb} · Acct ${account.accountNumber}${account.payId ? `\nPayID ${account.payId}` : ""}`
      : "No bank details on this claim.";
    if (!confirm(`Paying ${formatCurrency(amount)} to:\n\n${payee}\n\nConfirm this has been transferred?`)) return;
    setLoading(true);
    const res = await fetch(`/api/societies/${societySlug}/treasury/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REIMBURSED", expectedAmount: amount }),
    }).catch(offline);
    setLoading(false);
    if (res.ok) {
      toast.success("Marked as reimbursed");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to update");
    }
  }

  return (
    <Button size="sm" onClick={handleClick} disabled={loading} className="text-xs bg-green-700 hover:bg-green-800">
      <Banknote className="h-3.5 w-3.5 mr-1" />
      {loading ? "Saving…" : "Mark Reimbursed"}
    </Button>
  );
}
