"use client";

import { useParams, useRouter } from "next/navigation";
import { FeaturesForm } from "@/components/settings/FeaturesForm";

export default function FeaturesSettingsPage() {
  const params = useParams<{ society: string }>();
  const router = useRouter();
  // refresh() re-reads the layout, so the Rubric tab follows the Rubric toggle.
  return <FeaturesForm societySlug={params.society} onSaved={() => router.refresh()} />;
}
