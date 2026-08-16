"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeField } from "@/components/ui/datetime";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Printer, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { computePrintingCost, type PaperSize, type Sided, type Colour } from "@/lib/printing";
import { PrintingRates } from "@/components/requests/PrintingRates";

export default function NewPrintingRequestPage() {
  const params = useParams<{ society: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [quantity, setQuantity] = useState("1");
  const [pages, setPages] = useState("1");
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [sided, setSided] = useState<Sided>("SINGLE");
  const [colour, setColour] = useState<Colour>("BW");

  const estCost = computePrintingCost({
    paperSize,
    sided,
    colour,
    pages: Number(pages) || 0,
    quantity: Number(quantity) || 0,
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      toast.error("Please upload your document");
      return;
    }
    setLoading(true);
    const form = new FormData(e.currentTarget);

    // Upload the document first
    const fd = new FormData();
    fd.append("file", file);
    const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
    if (!uploadRes.ok) {
      const d = await uploadRes.json().catch(() => ({}));
      toast.error(d.error ?? "File upload failed (must be PDF or Word doc)");
      setLoading(false);
      return;
    }
    const { url } = await uploadRes.json();

    const res = await fetch(`/api/societies/${params.society}/printing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pickupAt: form.get("pickupAt"),
        quantity: Number(quantity),
        pages: Number(pages),
        paperSize,
        sided,
        colour,
        fileUrl: url,
        fileName: file.name,
        additionalDetails: form.get("additionalDetails") || undefined,
      }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Printing request submitted for approval");
      router.push(`/${params.society}/requests/printing`);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to submit request");
    }
  }

  // `relative` matters: the radio inside is sr-only, i.e. position: absolute. Without
  // a positioned ancestor its containing block is the viewport, so its static position
  // (below the fold on this form) stretched the document and let the whole window
  // scroll down into empty space beneath the app.
  const radio = (checked: boolean) =>
    `relative flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm text-center transition-colors ${
      checked ? "border-blue-600 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 hover:border-gray-300"
    }`;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2">
        <Link href={`/${params.society}/requests/printing`}><ArrowLeft className="h-4 w-4" /> Back</Link>
      </Button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center">
          <Printer className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Club Printing Request</h1>
          <p className="text-sm text-muted-foreground">Submit at least <strong>two full business days</strong> before collection.</p>
        </div>
      </div>

      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="p-4 text-sm text-amber-900 space-y-1.5">
          <p>Requests with less than two full business days&apos; notice may not be processed at all.</p>
          <p>Collect from <strong>Arc Front Desk, 10AM–4PM on business days</strong>. Uncollected prints are disposed of one week after the requested collection date.</p>
          <p>Prepare your file print-ready (PDF or Word). We can&apos;t trim, cut, or staple; resources for that are at Arc Reception.</p>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><CardTitle className="text-base">Collection</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="pickupAt">Latest pick-up date &amp; time *</Label>
              <DateTimeField id="pickupAt" name="pickupAt" required />
              <p className="text-xs text-muted-foreground">
                Submitted on behalf of your society; your name and email are taken from your account.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card data-tour="printing-options" className="mt-4">
          <CardHeader><CardTitle className="text-base">Print job</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity (number of copies) *</Label>
                <Input id="quantity" type="number" min="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pages">How many pages are in the document? *</Label>
                <Input id="pages" type="number" min="1" required value={pages} onChange={(e) => setPages(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Size *</Label>
              <div className="flex gap-2">
                {(["A4", "A3"] as PaperSize[]).map((s) => (
                  <label key={s} className={radio(paperSize === s)}>
                    <input type="radio" name="paperSize" className="sr-only" checked={paperSize === s} onChange={() => setPaperSize(s)} />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Single / double sided *</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                {([["SINGLE", "Single side"], ["DOUBLE_SHORT", "Double, flip short edge"], ["DOUBLE_LONG", "Double, flip long edge"]] as [Sided, string][]).map(([v, lbl]) => (
                  <label key={v} className={radio(sided === v)}>
                    <input type="radio" name="sided" className="sr-only" checked={sided === v} onChange={() => setSided(v)} />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Printing Colour *</Label>
              <div className="flex gap-2">
                {([["BW", "Black & White"], ["COLOUR", "Colour"]] as [Colour, string][]).map(([v, lbl]) => (
                  <label key={v} className={radio(colour === v)}>
                    <input type="radio" name="colour" className="sr-only" checked={colour === v} onChange={() => setColour(v)} />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">Upload your document * <span className="text-muted-foreground font-normal">(PDF or Word)</span></Label>
              <Input id="file" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="additionalDetails">Any additional printing details</Label>
              <Textarea id="additionalDetails" name="additionalDetails" rows={3} placeholder="e.g. anything our team should know" />
            </div>

            <div data-tour="printing-rates" className="space-y-2">
              <Label>Rates</Label>
              <PrintingRates selected={{ paperSize, sided, colour }} />
            </div>

            <div data-tour="printing-cost" className="rounded-lg bg-gray-50 border p-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Estimated cost (deducted from your secretarial allowance on approval)</span>
              <span className="text-lg font-bold text-green-700">${estCost.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <Button asChild variant="outline"><Link href={`/${params.society}/requests/printing`}>Cancel</Link></Button>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <><Upload className="h-4 w-4" /> Submit Request</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
