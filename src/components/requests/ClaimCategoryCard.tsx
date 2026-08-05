"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const UNCLASSIFIED = "__none__";

interface Props {
  societySlug: string;
  requestId: string;
  categoryId: string | null;
  categoryName: string | null;
  categories: { id: string; name: string }[];
  isExec: boolean;
}

export function ClaimCategoryCard({ societySlug, requestId, categoryId, categoryName, categories, isExec }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function reclassify(value: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/societies/${societySlug}/treasury/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetCategoryId: value === UNCLASSIFIED ? null : value }),
      });
      if (res.ok) {
        toast.success("Category updated");
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Failed to update category");
      }
    } catch {
      toast.error("Failed to update category");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-tour="claim-category">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Budget Category</CardTitle>
      </CardHeader>
      <CardContent>
        {isExec ? (
          <Select value={categoryId ?? UNCLASSIFIED} onValueChange={reclassify} disabled={saving}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={UNCLASSIFIED}>Unclassified</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm">{categoryName ?? <span className="text-muted-foreground">Unclassified</span>}</p>
        )}
      </CardContent>
    </Card>
  );
}
