"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { ThumbsUp, ThumbsDown, CheckCircle, XCircle } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";

interface Approval {
  id: string;
  approvedById: string;
  isTreasurer: boolean;
  approvedAt: Date | string;
  approvedBy: { id: string; name: string; avatarUrl?: string | null };
}

interface TreasuryApprovalPanelProps {
  requestId: string;
  societySlug: string;
  amount: number;
  approvals: Approval[];
  neededApprovals: number;
  needsTreasurer: boolean;
  isApproved: boolean;
  isExec: boolean;
  hasUserApproved: boolean;
  currentStatus: string;
}

export function TreasuryApprovalPanel({
  requestId,
  societySlug,
  amount,
  approvals,
  neededApprovals,
  needsTreasurer,
  isApproved,
  isExec,
  hasUserApproved,
  currentStatus,
}: TreasuryApprovalPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    const res = await fetch(`/api/societies/${societySlug}/treasury/${requestId}/approve`, { method: "POST" });
    setLoading(false);
    if (res.ok) {
      toast.success("Approved!");
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to approve");
    }
  }

  async function handleRevoke() {
    setLoading(true);
    const res = await fetch(`/api/societies/${societySlug}/treasury/${requestId}/approve`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) {
      toast.success("Approval revoked");
      router.refresh();
    } else {
      toast.error("Failed to revoke");
    }
  }

  async function handleReject() {
    if (!confirm("Reject this reimbursement request?")) return;
    setLoading(true);
    const res = await fetch(`/api/societies/${societySlug}/treasury/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REJECTED" }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Request rejected");
      router.refresh();
    } else {
      toast.error("Failed to reject");
    }
  }

  const canApprove = isExec && currentStatus === "AWAITING_APPROVAL";
  const canReject = isExec && currentStatus === "AWAITING_APPROVAL";

  return (
    <Card data-tour="approval-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Approval</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <p>
            Amount: <strong>{formatCurrency(amount)}</strong>
          </p>
          <p className="text-muted-foreground mt-1">
            Requires {neededApprovals} approval{neededApprovals > 1 ? "s" : ""}
            {needsTreasurer ? ", including the Treasurer" : " from any Executive"}.
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {Array.from({ length: neededApprovals }).map((_, i) => (
            <div
              key={i}
              className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                i < approvals.length
                  ? "bg-green-100 border-green-400"
                  : "bg-gray-100 border-gray-300"
              }`}
            >
              {i < approvals.length ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <span className="text-xs text-gray-400">{i + 1}</span>
              )}
            </div>
          ))}
          <span className="text-sm text-muted-foreground ml-1">
            {approvals.length} / {neededApprovals}
          </span>
        </div>

        {/* Approver list */}
        {approvals.length > 0 && (
          <div className="space-y-2">
            {approvals.map((a) => (
              <div key={a.id} className="flex items-center gap-2">
                <UserAvatar name={a.approvedBy.name} avatarUrl={a.approvedBy.avatarUrl} size="sm" />
                <span className="text-sm">{a.approvedBy.name}</span>
                {a.isTreasurer && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Treasurer</span>
                )}
              </div>
            ))}
          </div>
        )}

        {currentStatus === "REIMBURSED" ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 font-medium flex items-center gap-2">
            <CheckCircle className="h-4 w-4" /> Reimbursed
          </div>
        ) : isApproved && currentStatus !== "REJECTED" ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 font-medium flex items-center gap-2">
            <CheckCircle className="h-4 w-4" /> All approvals collected — pending reimbursement
          </div>
        ) : null}

        {/* Action buttons */}
        {(canApprove || canReject) && (
          <div className="flex gap-2 pt-1 flex-wrap">
            {canApprove && (
              hasUserApproved ? (
                <Button onClick={handleRevoke} variant="outline" size="sm" disabled={loading} className="text-orange-600 border-orange-300">
                  <ThumbsDown className="h-4 w-4 mr-1.5" /> Revoke Approval
                </Button>
              ) : (
                <Button onClick={handleApprove} size="sm" disabled={loading}>
                  <ThumbsUp className="h-4 w-4 mr-1.5" />
                  {loading ? "Approving…" : "Approve"}
                </Button>
              )
            )}
            {canReject && (
              <Button
                onClick={handleReject}
                variant="outline"
                size="sm"
                disabled={loading}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4 mr-1.5" /> Reject
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
