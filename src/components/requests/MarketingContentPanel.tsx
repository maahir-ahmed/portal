"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, Download, X, Loader2, CheckCircle2, Megaphone, Check } from "lucide-react";

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

/**
 * The graphics and the blurb are handed in separately — different people, usually on
 * different days — so each half saves on its own and neither waits on the other.
 *
 * There is no "done" checkbox: handing the work in is what done means. The server
 * derives bannerDone from whether any file is attached and blurbDone from whether the
 * blurb is non-empty, so the two can never disagree with what is actually here. Both
 * halves stay editable afterwards; saving again just replaces what was there.
 */
export function MarketingContentPanel({
  societySlug, requestId, bannerRequired, blurbRequired, currentStatus,
  initialBlurb, initialBannerDone, initialBlurbDone, deliverables,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [blurb, setBlurb] = useState(initialBlurb);
  const [savedBlurb, setSavedBlurb] = useState(initialBlurb);
  const [existing, setExisting] = useState<Deliverable[]>(deliverables);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<{ fileName: string; fileUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<"banner" | "blurb" | "complete" | null>(null);

  const graphicsDirty = newFiles.length > 0 || removedIds.length > 0;
  const blurbDirty = blurb !== savedBlurb;

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

  async function patch(which: "banner" | "blurb" | "complete", body: Record<string, unknown>) {
    setBusy(which);
    const res = await fetch(`/api/societies/${societySlug}/content-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) {
      toast.error("Failed to save");
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveGraphics() {
    const ok = await patch("banner", { addDeliverables: newFiles, removeDeliverableIds: removedIds });
    if (!ok) return;
    setNewFiles([]);
    setRemovedIds([]);
    toast.success("Graphics saved");
  }

  async function saveBlurb() {
    const ok = await patch("blurb", { finishedBlurb: blurb });
    if (!ok) return;
    setSavedBlurb(blurb);
    toast.success(blurb.trim() ? "Blurb saved" : "Blurb cleared");
  }

  // Shown once something is actually handed in, so the panel says where each half is
  // without anyone having to tick anything.
  const handedIn = (label: string) => (
    <span className="inline-flex items-center gap-1 text-xs text-green-700">
      <Check className="h-3.5 w-3.5" /> {label}
    </span>
  );

  const bannerBlock = bannerRequired && (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label>Finished graphics</Label>
        {initialBannerDone && !graphicsDirty && handedIn("Handed in")}
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
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading || busy !== null}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload graphics
        </Button>
        <Button type="button" size="sm" onClick={saveGraphics} disabled={!graphicsDirty || uploading || busy !== null}>
          {busy === "banner" ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</> : "Save graphics"}
        </Button>
      </div>
    </div>
  );

  const blurbBlock = blurbRequired && (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="finishedBlurb">Event blurb</Label>
        {initialBlurbDone && !blurbDirty && handedIn("Handed in")}
      </div>
      <Textarea id="finishedBlurb" value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={5} placeholder="Paste the finished event blurb here…" />
      <Button type="button" size="sm" onClick={saveBlurb} disabled={!blurbDirty || busy !== null}>
        {busy === "blurb" ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</> : "Save blurb"}
      </Button>
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

        {currentStatus !== "COMPLETED" && (
          <div className="pt-1">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={async () => {
                if (await patch("complete", { status: "COMPLETED" })) toast.success("Marked complete");
              }}
              disabled={busy !== null || uploading}
            >
              <CheckCircle2 className="h-4 w-4" /> Mark content complete
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
