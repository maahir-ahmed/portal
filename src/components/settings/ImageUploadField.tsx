"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, ImageIcon } from "lucide-react";

interface ImageUploadFieldProps {
  name: string;            // form field name (hidden input carries the URL)
  label: string;
  defaultValue?: string | null;
  shape?: "square" | "wide";
  hint?: string;
}

export function ImageUploadField({ name, label, defaultValue, shape = "wide", hint }: ImageUploadFieldProps) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    setUploading(false);
    if (res.ok) {
      const data = await res.json();
      setUrl(data.url);
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Upload failed: images only, max 10MB");
    }
  }

  const previewClass =
    shape === "square"
      ? "h-16 w-16 rounded-xl bg-[#0b0b0d] p-2"
      : "h-16 w-28 rounded-lg bg-muted";

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <input type="hidden" name={name} value={url} />
      <div className="flex items-center gap-4">
        <div className={`flex items-center justify-center overflow-hidden border border-border flex-shrink-0 ${previewClass}`}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className={shape === "square" ? "h-full w-full object-contain" : "h-full w-full object-cover"} />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-1.5">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {url ? "Replace" : "Upload"}
          </Button>
          {url && (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="text-xs text-muted-foreground hover:text-red-600 transition-colors text-left"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
