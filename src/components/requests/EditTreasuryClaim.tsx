"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Upload, X, FileText, Loader2 } from "lucide-react";

interface Receipt { id: string; fileName: string; fileUrl: string; }

interface Props {
  societySlug: string;
  requestId: string;
  initial: { description: string; amount: number; expenseDate: string; locationSupplier: string; contactEmail: string };
  receipts: Receipt[];
}

function toDateInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function EditTreasuryClaim({ societySlug, requestId, initial, receipts }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [description, setDescription] = useState(initial.description);
  const [amount, setAmount] = useState(String(initial.amount));
  const [expenseDate, setExpenseDate] = useState(toDateInput(initial.expenseDate));
  const [locationSupplier, setLocationSupplier] = useState(initial.locationSupplier);
  const [contactEmail, setContactEmail] = useState(initial.contactEmail);

  const [existing, setExisting] = useState<Receipt[]>(receipts);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<{ fileName: string; fileUrl: string }[]>([]);

  async function handleFiles(files: FileList) {
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const { url } = await res.json();
        setNewFiles((p) => [...p, { fileName: file.name, fileUrl: url }]);
      } else {
        toast.error(`Upload failed: ${file.name}`);
      }
    }
    setUploading(false);
  }

  async function save() {
    if (!description.trim() || !amount || Number(amount) <= 0) {
      toast.error("Description and a positive amount are required");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/societies/${societySlug}/treasury/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description, amount: Number(amount), expenseDate, locationSupplier, contactEmail,
        addReceipts: newFiles,
        removeReceiptIds: removedIds,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Claim updated");
      setNewFiles([]); setRemovedIds([]); setOpen(false);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to update claim");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit claim</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit reimbursement claim</DialogTitle>
          <DialogDescription>Update the details and manage receipt documents.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="e-desc">Description *</Label>
            <Textarea id="e-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-amount">Amount ($) *</Label>
              <Input id="e-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-date">Expense date</Label>
              <Input id="e-date" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-supplier">Supplier / location</Label>
            <Input id="e-supplier" value={locationSupplier} onChange={(e) => setLocationSupplier(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-email">Contact email</Label>
            <Input id="e-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Receipts &amp; documents</Label>
            <div className="space-y-1.5">
              {existing.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 min-w-0 hover:underline">
                    <FileText className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate">{r.fileName}</span>
                  </a>
                  <button type="button" onClick={() => { setExisting((p) => p.filter((x) => x.id !== r.id)); setRemovedIds((p) => [...p, r.id]); }} className="text-muted-foreground hover:text-red-600">
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
              {existing.length === 0 && newFiles.length === 0 && (
                <p className="text-xs text-muted-foreground">No documents attached.</p>
              )}
            </div>
            <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Add document
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || uploading}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
