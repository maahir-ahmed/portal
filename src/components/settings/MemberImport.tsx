"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IMPORT_TEMPLATE, type ImportCheck } from "@/lib/memberImport";
import { cn } from "@/lib/utils";

const STATUS = {
  add: { label: "Will add", className: "bg-green-100 text-green-800" },
  skip: { label: "Skipped", className: "bg-gray-100 text-gray-700" },
  error: { label: "Problem", className: "bg-red-100 text-red-800" },
} as const;

// Settings > Import members, and the setup wizard's members step. Upload, check the
// preview, then import: the server re-checks the same file and writes all or nothing.
export function MemberImport({ societySlug, onImported }: { societySlug: string; onImported?: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(f: File, dryRun: boolean) {
    const q = new URLSearchParams({ name: f.name, ...(dryRun ? { dryRun: "1" } : {}) });
    const res = await fetch(`/api/societies/${societySlug}/members/import?${q}`, { method: "POST", body: f });
    return { ok: res.ok, data: (await res.json().catch(() => ({ error: "Something went wrong" }))) as ImportCheck & { added?: number } };
  }

  async function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setCheck(null);
    setBusy(true);
    const { data } = await send(f, true);
    setBusy(false);
    setCheck(data);
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    const { ok, data } = await send(file, false);
    setBusy(false);
    if (!ok) {
      setCheck(data);
      toast.error(data.error ?? "Import failed. Nothing was added.");
      return;
    }
    toast.success(`Added ${data.added} ${data.added === 1 ? "member" : "members"}`);
    setFile(null);
    setCheck(null);
    if (input.current) input.current.value = "";
    router.refresh();
    onImported?.();
  }

  const rows = check?.rows ?? [];
  const count = (s: keyof typeof STATUS) => rows.filter((r) => r.status === s).length;
  const canImport = !!check && !check.error && count("error") === 0 && count("add") > 0;

  return (
    <Card data-tour="settings-import">
      <CardHeader>
        <CardTitle className="text-base">Import members</CardTitle>
        <CardDescription>
          Add your committee from a spreadsheet (.csv or .xlsx). Nobody is emailed: each person shows as
          &quot;Not invited&quot; on the Members page until you issue them a passphrase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="list-decimal pl-5 text-sm space-y-1 text-muted-foreground">
          <li>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`}
              download="members-template.csv"
              className="font-medium text-foreground underline"
            >
              Download the template
            </a>{" "}
            and fill in one person per row. Name, email and role (Executive, Director or Subcommittee) are needed;
            the rest is optional. Separate several portfolios with a semicolon.
          </li>
          <li>Upload it below and check the preview.</li>
        </ol>
        <input
          ref={input}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Members file"
          onChange={(e) => choose(e.target.files?.[0])}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
        />
        {busy && !check && <p className="text-sm text-muted-foreground">Checking…</p>}
        {check?.error && <p className="text-sm text-red-700">{check.error}</p>}

        {rows.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm">
              <strong>{count("add")}</strong> to add, <strong>{count("skip")}</strong> skipped,{" "}
              <strong className={count("error") ? "text-red-700" : ""}>{count("error")}</strong> with problems.
            </p>
            {check!.newPortfolios.length > 0 && (
              <p className="text-sm text-muted-foreground">
                These portfolios don&apos;t exist yet and will be created: {check!.newPortfolios.join(", ")}.
              </p>
            )}
            <ul className="divide-y rounded-md border text-sm">
              {rows.map((r) => (
                <li key={r.line} className="px-3 py-2 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs text-muted-foreground">Row {r.line}</span>
                    <span className="font-medium break-all">{r.name || "(no name)"}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full", STATUS[r.status].className)}>
                      {STATUS[r.status].label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground break-all">
                    {[r.email, r.role?.toLowerCase(), r.title, r.portfolios.join(", ")].filter(Boolean).join(" · ")}
                  </p>
                  {r.problems.map((p) => (
                    <p key={p} className={cn("text-xs", r.status === "error" ? "text-red-700" : "text-muted-foreground")}>
                      {p}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            {count("error") > 0 && (
              <p className="text-sm text-muted-foreground">Fix those rows in your file and upload it again.</p>
            )}
            <Button onClick={commit} disabled={!canImport || busy}>
              {busy ? "Importing…" : `Import ${count("add")} ${count("add") === 1 ? "member" : "members"}`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
