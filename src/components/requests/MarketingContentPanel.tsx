"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, Download, X, Loader2, CheckCircle2, Megaphone } from "lucide-react";

interface Deliverable {
  id: string;
  fileName: string;
  fileUrl: string;
}

interface Props {
  societySlug: string;
  requestId: string;
  bannerRequired: boolean;
  blurbRequired: boolean;
  currentStatus: string;
  initialBlurb: string;
  initialBannerDone: boolean;
  initialBlurbDone: boolean;
  deliverables: Deliverable[];
}

export function MarketingContentPanel({
  societySlug, requestId, bannerRequired, blurbRequired, currentStatus,
  initialBlurb, initialBannerDone, initialBlurbDone, deliverables,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [blurb, setBlurb] = useState(initialBlurb);
  const [bannerDone, setBannerDone] = useState(initialBannerDone);
  const [blurbDone, setBlurbDone] = useState(initialBlurbDone);
  const [existing, setExisting] = useState<Deliverable[]>(deliverables);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<{ fileName: string; fileUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleFiles(files: FileList) {
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const { url } = await res.json();
        setNewFiles((prev) => [...prev, { fileName: file.name, fileUrl: url }]);
      } else {
        toast.error(`Upload failed: ${file.name}`);
      }
    }
    setUploading(false);
  }

  async function save(markComplete = false) {
    setSaving(true);
    const res = await fetch(`/api/societies/${societySlug}/content-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finishedBlurb: blurb,
        bannerDone,
        blurbDone,
        addDeliverables: newFiles,
        removeDeliverableIds: removedIds,
        ...(markComplete ? { status: "COMPLETED" } : {}),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(markComplete ? "Marked complete" : "Saved");
      setNewFiles([]);
      setRemovedIds([]);
      router.refresh();
    } else {
      toast.error("Failed to save");
    }
  }

  const bannerBlock = bannerRequired && (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <Label>Finished graphics</Label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer text-muted-foreground">
          <input type="checkbox" checked={bannerDone} onChange={(e) => setBannerDone(e.target.checked)} className="h-3.5 w-3.5 rounded border-input" />
          Banner done
        </label>
      </div>

      <div className="space-y-1.5">
        {existing.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            <a href={d.fileUrl} download className="inline-flex items-center gap-2 text-foreground hover:underline min-w-0">
              <Download className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate">{d.fileName}</span>
            </a>
            <button type="button" onClick={() => { setExisting((p) => p.filter((x) => x.id !== d.id)); setRemovedIds((p) => [...p, d.id]); }} className="text-muted-foreground hover:text-red-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {newFiles.map((f, i) => (
          <div key={`new-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-2 min-w-0"><Upload className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate">{f.fileName}</span> <span className="text-xs text-muted-foreground">(unsaved)</span></span>
            <button type="button" onClick={() => setNewFiles((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Upload graphics
      </Button>
    </div>
  );

  const blurbBlock = blurbRequired && (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="finishedBlurb">Event blurb</Label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer text-muted-foreground">
          <input type="checkbox" checked={blurbDone} onChange={(e) => setBlurbDone(e.target.checked)} className="h-3.5 w-3.5 rounded border-input" />
          Blurb done
        </label>
      </div>
      <Textarea id="finishedBlurb" value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={5} placeholder="Paste the finished event blurb here…" />
    </div>
  );

  return (
    <Card data-tour="marketing-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4" /> Marketing Deliverables
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {bannerBlock}
        {blurbBlock}
        {!bannerRequired && !blurbRequired && (
          <p className="text-sm text-muted-foreground">No banner or blurb was requested for this event.</p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={() => save(false)} disabled={saving || uploading}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : "Save"}
          </Button>
          {currentStatus !== "COMPLETED" && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => save(true)} disabled={saving || uploading}>
              <CheckCircle2 className="h-4 w-4" /> Mark content complete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
