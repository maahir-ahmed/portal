"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpCircle } from "lucide-react";

interface Status {
  enabled: boolean;
  latest: string | null;
  available: boolean;
  requestedAt: string | null;
  result: string | null;
  resultVersion: string | null;
}

// Across the top of every page for executives while a newer release is out, and until
// it is installed: there's no dismissing it. Members never see it (the route is
// executive-only), nor does a stack that doesn't update itself.
export function UpdateBanner({ societySlug }: { societySlug: string }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch(`/api/societies/${societySlug}/updates`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, [societySlug]);

  if (!status?.enabled || !status.available) return null;
  // Only about this release: a newer one is offered afresh.
  const failed = (status.result === "failed" || status.result === "rolled_back") && status.resultVersion === status.latest;

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-2 text-sm ${
        failed ? "border-red-200 bg-red-50 text-red-900" : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
    >
      <ArrowUpCircle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {status.requestedAt
          ? `Installing version ${status.latest}. The portal will restart for a minute or two.`
          : failed
            ? `Version ${status.latest} didn't install. The portal is still on the version before.`
            : `Version ${status.latest} is out. It installs tonight, or you can update now.`}
      </span>
      {!status.requestedAt && (
        <Link href={`/${societySlug}/settings/general#updates`} className="font-medium underline underline-offset-2">
          {failed ? "See why" : "Update"}
        </Link>
      )}
    </div>
  );
}
