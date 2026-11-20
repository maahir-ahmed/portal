"use client";

import { useRouter } from "next/navigation";
import { FeaturesForm } from "@/components/settings/FeaturesForm";

// refresh() re-reads the layout, so the Rubric tab follows the Rubric toggle.
export function FeaturesClient({ societySlug }: { societySlug: string }) {
  const router = useRouter();
  return <FeaturesForm societySlug={societySlug} onSaved={() => router.refresh()} />;
}
