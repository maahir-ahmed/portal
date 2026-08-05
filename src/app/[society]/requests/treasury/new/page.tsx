"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, AlertCircle, CheckCircle, Upload, Building } from "lucide-react";
import Link from "next/link";

const RULES = [
  "Get the spend approved in the committee Discord BEFORE you buy. This form is only for claiming the money back.",
  "Alcohol and alcoholic beverages are NOT reimbursable under any circumstances.",
  "Personal transport (Uber, taxi, fuel) is NOT reimbursable unless explicitly pre-approved in writing.",
  "Claims submitted more than 3 weeks after the purchase date may not be reimbursed.",
  "Bonding money (held deposits) must be pre-approved and will only be reimbursed once returned.",
];

interface BankAccount {
  id: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
}

interface BudgetCategory {
  id: string;
  name: string;
}

const UNCLASSIFIED = "__none__";

export default function NewTreasuryPage() {
  const router = useRouter();
  const params = useParams<{ society: string }>();
  const [loading, setLoading] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [useExisting, setUseExisting] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [savedAccount, setSavedAccount] = useState<BankAccount | null | undefined>(undefined);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>(UNCLASSIFIED);
  const formRef = useRef<HTMLFormElement>(null);

  // Fetch the user's bank account on mount
  useEffect(() => {
    fetch("/api/me/bank-account")
      .then((r) => r.json())
      .then((data) => {
        setSavedAccount(data);
        // If no account on file, default to manual entry
        if (!data) setUseExisting(false);
      })
      .catch(() => setSavedAccount(null));
  }, []);

  // Fetch budget categories so the submitter can classify the expense.
  useEffect(() => {
    fetch(`/api/societies/${params.society}/budget/categories`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, [params.society]);

  async function submit(status: "DRAFT" | "REIMBURSEMENT_PENDING") {
    if (!formRef.current) return;
    // The rules acknowledgement is only required to actually submit, not to draft.
    if (status === "REIMBURSEMENT_PENDING" && !acknowledged) {
      toast.error("You must acknowledge the reimbursement rules");
      return;
    }
    setLoading(true);
    const form = new FormData(formRef.current);

    // Upload files first
    const fileUrls: string[] = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      if (uploadRes.ok) {
        const { url } = await uploadRes.json();
        fileUrls.push(url);
      }
    }

    const body: Record<string, unknown> = {
      contactEmail: form.get("contactEmail"),
      expenseDate: form.get("expenseDate"),
      locationSupplier: form.get("locationSupplier"),
      description: form.get("description"),
      amount: Number(form.get("amount")) || 0,
      useExistingBank: useExisting && !!savedAccount,
      acknowledgedRules: acknowledged,
      receiptUrls: fileUrls,
      budgetCategoryId: categoryId === UNCLASSIFIED ? null : categoryId,
      status,
    };

    if (!useExisting || !savedAccount) {
      body.bankAccountName = form.get("bankAccountName");
      body.bankBsb = form.get("bankBsb");
      body.bankAccountNumber = form.get("bankAccountNumber");
      body.saveToProfile = !savedAccount; // save to profile only if user has no account yet
    }

    const res = await fetch(`/api/societies/${params.society}/treasury`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      toast.success(status === "DRAFT" ? "Draft saved" : "Claim submitted for reimbursement!");
      router.push(`/${params.society}/requests/treasury/${data.id}`);
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to save claim");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/${params.society}/requests/treasury`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Reimbursement Request</h1>
          <p className="text-sm text-muted-foreground">Submit an expense claim</p>
        </div>
      </div>

      {/* Rules acknowledgement */}
      <Card data-tour="treasury-rules" className="border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" /> Reimbursement Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {RULES.map((rule, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-amber-600 mt-0.5 flex-shrink-0">•</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm font-medium">
              I have read and understood the reimbursement policy above
            </span>
          </label>
        </CardContent>
      </Card>

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit("REIMBURSEMENT_PENDING"); }} className="space-y-6">
        {/* Expense Details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Expense Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email *</Label>
              <Input id="contactEmail" name="contactEmail" type="email" required placeholder="your@email.com" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expenseDate">Expense Date *</Label>
                <Input id="expenseDate" name="expenseDate" type="date" required />
              </div>
              <div data-tour="treasury-amount" className="space-y-2">
                <Label htmlFor="amount">Amount (AUD) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input id="amount" name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" className="pl-7" required />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="locationSupplier">Location / Supplier / Seller *</Label>
              <Input id="locationSupplier" name="locationSupplier" placeholder="e.g. Woolworths Kingsford" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description" name="description"
                placeholder="What was purchased and why? Which event is this for?"
                rows={3} required
              />
            </div>
            {categories.length > 0 && (
              <div data-tour="treasury-category" className="space-y-2">
                <Label>Budget Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNCLASSIFIED}>Not sure, let an exec classify it</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Which budget does this expense come out of? An exec can change this later.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Receipts */}
        <Card data-tour="treasury-receipts">
          <CardHeader><CardTitle className="text-base">Receipts &amp; Attachments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => document.getElementById("receipt-upload")?.click()}
            >
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Click to upload receipts</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG up to 10MB each</p>
              <input
                id="receipt-upload" type="file" multiple accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </div>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                    {f.name}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Bank Details */}
        <Card data-tour="treasury-bank">
          <CardHeader><CardTitle className="text-base">Bank Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {savedAccount === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={useExisting && !!savedAccount}
                      onChange={() => setUseExisting(true)}
                      disabled={!savedAccount}
                      className="h-4 w-4"
                    />
                    <span className={`text-sm ${!savedAccount ? "text-muted-foreground" : ""}`}>
                      Use details on file
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!useExisting || !savedAccount}
                      onChange={() => setUseExisting(false)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">I&apos;ll enter my own</span>
                  </label>
                </div>

                {useExisting && savedAccount ? (
                  /* Show saved account details read-only */
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
                      <Building className="h-4 w-4" />
                      Bank account on file
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Account Name</p>
                        <p className="font-medium">{savedAccount.accountName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">BSB</p>
                        <p className="font-medium">{savedAccount.bsb}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Account Number</p>
                        <p className="font-medium">{savedAccount.accountNumber}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Manual entry */
                  <div className="space-y-4 pt-1">
                    {!savedAccount && (
                      <p className="text-xs text-muted-foreground bg-gray-50 border rounded p-2">
                        No bank account saved yet. Your details will be saved to your profile after submission.
                      </p>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="bankAccountName">Account Name *</Label>
                      <Input id="bankAccountName" name="bankAccountName" placeholder="Jane Smith" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bankBsb">BSB *</Label>
                        <Input id="bankBsb" name="bankBsb" placeholder="000-000" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bankAccountNumber">Account Number *</Label>
                        <Input id="bankAccountNumber" name="bankAccountNumber" placeholder="XXXXXXXXXX" required />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div data-tour="treasury-submit" className="flex gap-3">
          <Button type="submit" disabled={loading || !acknowledged || savedAccount === undefined}>
            {loading ? "Submitting…" : "Submit Claim"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => submit("DRAFT")}
            disabled={loading || savedAccount === undefined}
          >
            {loading ? "Saving…" : "Save as draft"}
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/${params.society}/requests/treasury`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
