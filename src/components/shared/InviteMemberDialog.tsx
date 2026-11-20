"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";
import { offline } from "@/lib/utils";
import { copyText } from "@/lib/clientApi";

interface SocietyTitle {
  id: string;
  name: string;
  roleLevel: string;
  portfolio: { id: string; name: string } | null;
}

interface InviteMemberDialogProps {
  societySlug: string;
}

export function InviteMemberDialog({ societySlug }: InviteMemberDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [titles, setTitles] = useState<SocietyTitle[]>([]);
  const [role, setRole] = useState("SUBCOMMITTEE");
  const [title, setTitle] = useState("__none__");
  // Shown inline and cleared on close, like the edit dialog's reset: never in a toast
  // that outlives the dialog.
  const [issued, setIssued] = useState<{ tempPassword: string; emailed: boolean } | null>(null);

  useEffect(() => {
    if (open) {
      fetch(`/api/societies/${societySlug}/titles`)
        .then((r) => r.json())
        .then(setTitles)
        .catch(() => {});
    }
  }, [open, societySlug]);

  function handleRoleChange(newRole: string) {
    setRole(newRole);
    setTitle("__none__");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const res = await fetch(`/api/societies/${societySlug}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        role,
        title: title === "__none__" ? null : title,
      }),
    }).catch(offline);

    setLoading(false);
    const data = await res.json();

    if (res.ok) {
      setRole("SUBCOMMITTEE");
      setTitle("__none__");
      if (data.tempPassword) {
        setIssued({ tempPassword: data.tempPassword, emailed: !!data.emailed });
      } else {
        toast.success("Member added successfully");
        setOpen(false);
      }
      router.refresh();
    } else {
      toast.error(data.error ?? "Failed to add member");
    }
  }

  const titleOptions = titles.filter((t) => t.roleLevel === role);
  // Executives hold no portfolio; everyone else inherits their title's.
  const selectedPortfolio =
    role === "EXECUTIVE" ? null : titles.find((t) => t.name === title)?.portfolio?.name ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setIssued(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" data-tour="member-invite"><UserPlus className="h-4 w-4 mr-2" /> Add Member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
        {issued ? (
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/40 p-2">
              <p className="text-xs text-muted-foreground mb-1.5">
                Member added.{" "}
                {issued.emailed
                  ? "Temporary passphrase, also emailed to them. "
                  : "Temporary passphrase: copy and share it now, it won't be shown again. "}
                They&apos;ll be asked to choose their own password when they sign in.
              </p>
              <div className="flex items-center gap-2">
                {/* Wraps rather than truncates: the whole point of a passphrase is being readable. */}
                <code className="flex-1 break-all rounded bg-background px-2 py-1 text-sm">{issued.tempPassword}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => copyText(issued.tempPassword, "passphrase")}>
                  Copy
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => { setOpen(false); setIssued(null); }}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input id="name" name="name" placeholder="e.g. Jane Smith" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input id="email" name="email" type="email" placeholder="name@example.com" required />
          </div>
          <div className="space-y-2">
            <Label>Role *</Label>
            <Select value={role} onValueChange={handleRoleChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SUBCOMMITTEE">Subcommittee</SelectItem>
                <SelectItem value="DIRECTOR">Director</SelectItem>
                <SelectItem value="EXECUTIVE">Executive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Select value={title} onValueChange={setTitle}>
              <SelectTrigger><SelectValue placeholder="Select a title…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">(No title)</SelectItem>
                {titleOptions.map((t) => (
                  <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedPortfolio && (
            <p className="text-xs text-muted-foreground">
              Portfolio: <span className="font-medium text-foreground">{selectedPortfolio}</span>, from the title.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Adding…" : "Add Member"}</Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
