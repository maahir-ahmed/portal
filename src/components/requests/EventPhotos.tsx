"use client";

/* eslint-disable @next/next/no-img-element -- these are auth-gated files under /uploads,
   which next/image would fetch server-side without the viewer's session cookie. */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Upload, X, Loader2 } from "lucide-react";

interface Photo {
  id: string;
  fileName: string;
  fileUrl: string;
}

interface Props {
  societySlug: string;
  requestId: string;
  photos: Photo[];
  canManage: boolean;
}

// Matches the image types /api/upload allows and the photos route accepts.
const IMAGE_TYPES = "image/jpeg,image/png,image/gif,image/webp";

export function EventPhotos({ societySlug, requestId, photos, canManage }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const apiPath = `/api/societies/${societySlug}/content-requests/${requestId}/photos`;

  // Each photo is saved as soon as it uploads, so one bad file doesn't cost the rest.
  async function handleFiles(files: FileList) {
    setUploading(true);
    let saved = 0;
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("accept", "image");
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        const upData = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(upData.error);

        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, fileUrl: upData.url }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error);
        saved++;
      } catch (err) {
        const reason = err instanceof Error && err.message ? `: ${err.message}` : "";
        toast.error(`${file.name} couldn't be uploaded${reason}`);
      }
    }
    setUploading(false);
    if (saved > 0) {
      toast.success(saved === 1 ? "Photo added" : `${saved} photos added`);
      router.refresh();
    }
  }

  async function remove(photo: Photo) {
    setDeletingId(photo.id);
    const res = await fetch(`${apiPath}?photoId=${encodeURIComponent(photo.id)}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      toast.success("Photo removed");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? `Couldn't remove ${photo.fileName}`);
    }
  }

  return (
    <Card data-tour="event-photos">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4" /> Activity photos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((p) => (
              <div key={p.id} className="relative">
                <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" title={p.fileName}>
                  <img
                    src={p.fileUrl}
                    alt={p.fileName}
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-lg border border-border object-cover bg-muted"
                  />
                </a>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    disabled={deletingId === p.id}
                    aria-label={`Remove ${p.fileName}`}
                    className="absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1 text-muted-foreground shadow-sm hover:text-red-600 disabled:opacity-50"
                  >
                    {deletingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No photos yet. Arc asks for photos of the event as evidence for the activity grant.
          </p>
        )}
        {canManage && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={IMAGE_TYPES}
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
            />
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Add photos
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
