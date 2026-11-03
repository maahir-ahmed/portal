"use client";

import { useParams } from "next/navigation";
import { PoliciesForm } from "@/components/settings/PoliciesForm";

export default function PoliciesSettingsPage() {
  const params = useParams<{ society: string }>();
  return <PoliciesForm societySlug={params.society} />;
}
