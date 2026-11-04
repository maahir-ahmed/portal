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
import { Pencil, Trash2 } from "lucide-react";
import { offline } from "@/lib/utils";

interface SocietyTitle {
  id: string;
  name: string;
  roleLevel: string;
  portfolio: { id: string; name: string } | null;
}

interface EditMemberDialogProps {
  societySlug: string;
  membershipId: string;
  memberName: string;
  memberPhone: string | null;
  currentRole: string;
  currentTitle: string | null;
  extraPortfolioIds: string[];
  /** Imported and never given a passphrase: the reset button issues their first. */
  notInvited?: boolean;
}

interface Portfolio {
  id: string;
  name: string;
}

export function EditMemberDialog({
  societySlug,
  membershipId,
  memberName,
  memberPhone,
  currentRole,
  currentTitle,
  extraPortfolioIds,
  notInvited = false,
}: EditMemberDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [titles, setTitles] = useState<SocietyTitle[]>([]);
  const [role, setRole] = useState(currentRole);
  const [title, setTitle] = useState(currentTitle ?? "__none__");
  const [phone, setPhone] = useState(memberPhone ?? "");
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [extras, setExtras] = useState<string[]>(extraPortfolioIds);

  useEffect(() => {
    if (open) {
      fetch(`/api/societies/${societySlug}/titles`)
        .then((r) => r.json())
        .then(setTitles)
        .catch(() => {});
      fetch(`/api/societies/${societySlug}/portfolios`)
        .then((r) => r.json())
        .then(setPortfolios)
        .catch(() => {});
    }
  }, [open, societySlug]);

  function handleRoleChange(newRole: string) {
    setRole(newRole);
    setTitle("__none__");
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/societies/${societySlug}/members/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        title: title === "__none__" ? null : title,
        phone: phone.trim() || null,
        extraPortfolioIds: extras,
      }),
    }).catch(offline);
    setSaving(false);
    if (res.ok) {
      toast.success("Member updated");
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to update member");
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove ${memberName} from this society?`)) return;
    setRemoving(true);
    const res = await fetch(`/api/societies/${societySlug}/members/${membershipId}`, { method: "DELETE" }).catch(offline);
    setRemoving(false);
    if (res.ok) {
      toast.success(`${memberName} removed`);
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to remove member");
    }
  }

  async function handleReset() {
    if (!notInvited && !confirm(`Reset ${memberName}'s password? Their current password stops working immediately.`)) return;
    setResetting(true);
    const res = await fetch(`/api/societies/${societySlug}/members/${membershipId}/reset-password`, { method: "POST" }).catch(offline);
    setResetting(false);
    if (res.ok) {
      const data = await res.json();
      setTempPassword(data.tempPassword);
      setEmailed(!!data.emailed);
      if (notInvited) router.refresh(); // drops the "not invited" badge
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to reset password");
    }
  }

  const titleOptions = titles.filter((t) => t.roleLevel === role);
  // Executives hold no portfolio; everyone else inherits their title's.
  const derivedId = role === "EXECUTIVE" ? null : titles.find((t) => t.name === title)?.portfolio?.id ?? null;
  const derivedPortfolio = portfolios.find((p) => p.id === derivedId)?.name ?? null;
  const otherPortfolios = portfolios.filter((p) => p.id !== derivedId);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTempPassword(null); }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {memberName}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Role</Label>
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
          <p className="text-xs text-muted-foreground">
            Portfolio:{" "}
            <span className="font-medium text-foreground">{derivedPortfolio ?? "none"}</span>
            {role === "EXECUTIVE" ? ", executives are grouped by role" : ", from the title"}
          </p>
          {otherPortfolios.length > 0 && (
            <div className="space-y-2">
              <Label>Also in</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {otherPortfolios.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={extras.includes(p.id)}
                      onChange={(e) =>
                        setExtras(e.target.checked ? [...extras, p.id] : extras.filter((x) => x !== p.id))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Phone (contact details)</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+61 4xx xxx xxx"
              type="tel"
            />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            {tempPassword ? (
              <div className="rounded-md border bg-muted/40 p-2">
                <p className="text-xs text-muted-foreground mb-1.5">
                  {emailed
                    ? "Temporary passphrase, also emailed to them. "
                    : "Temporary passphrase: copy and share it now, it won't be shown again. "}
                  They&apos;ll be asked to choose their own password when they sign in.
                </p>
                <div className="flex items-center gap-2">
                  {/* Wraps rather than truncates: the whole point of a passphrase is being readable. */}
                  <code className="flex-1 break-all rounded bg-background px-2 py-1 text-sm">{tempPassword}</code>
                  <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(tempPassword); toast.success("Copied"); }}>
                    Copy
                  </Button>
                </div>
              </div>
            ) : notInvited ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Not invited yet: they have no way to sign in.</p>
                <Button type="button" size="sm" onClick={handleReset} disabled={resetting}>
                  {resetting ? "Issuing…" : "Issue passphrase"}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={resetting}>
                {resetting ? "Resetting…" : "Reset password"}
              </Button>
            )}
          </div>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button" variant="destructive" size="sm"
            onClick={handleRemove} disabled={removing}
            className="sm:mr-auto"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {removing ? "Removing…" : "Remove Member"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
