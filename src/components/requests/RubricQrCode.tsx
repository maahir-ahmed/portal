"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Download, Contrast } from "lucide-react";

// Auto-generates a transparent QR code from the Rubric event link, no upload needed.
export function RubricQrCode({ value }: { value: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(true); // true = black modules on transparent

  function download() {
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `rubric-qr-${dark ? "black" : "white"}.png`;
    a.click();
  }

  return (
    <div className="space-y-2.5">
      <div
        ref={wrapRef}
        className={`inline-block rounded-lg p-3 ${dark ? "bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] border border-border" : "bg-[#0b0b0d]"}`}
      >
        <QRCodeCanvas value={value} size={148} bgColor="transparent" fgColor={dark ? "#000000" : "#ffffff"} level="M" marginSize={0} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={download}>
          <Download className="h-3.5 w-3.5" /> Download PNG
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setDark((d) => !d)}>
          <Contrast className="h-3.5 w-3.5" /> {dark ? "White version" : "Black version"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Transparent background · downloads as PNG.</p>
    </div>
  );
}
