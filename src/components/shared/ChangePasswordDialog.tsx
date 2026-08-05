"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KeyRound, Loader2 } from "lucide-react";

// Shown when an executive issued the password (a new member, or a reset), until
// the member picks their own. Blocking on purpose: no X, no Escape, no clicking
// away, because a dismissible prompt is a prompt everyone dismisses.
//
// ponytail: this is a front door, not a lock. A determined user could still call
// the API around it; the case it is actually for is the member who logs in with a
// passphrase from Discord and would otherwise never change it. Gate the API on
// mustChangePassword too if that stops being the threat.
const MIN_LENGTH = 8;

export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { mustChangePassword?: boolean } | null) => {
        if (!cancelled && me?.mustChangePassword) setOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");

    if (newPassword.length < MIN_LENGTH) {
      toast.error(`Your new password must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (newPassword !== form.get("confirmPassword")) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("Your new password must be different from the temporary one");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/me/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSaving(false);

    if (res.ok) {
      toast.success("Password set. You're all set.");
      setOpen(false);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not change your password");
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        hideClose
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-md"
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[hsl(var(--brand-deep))]/10 flex items-center justify-center flex-shrink-0">
              <KeyRound className="h-[18px] w-[18px] text-[hsl(var(--brand-deep))]" />
            </div>
            <DialogTitle>Choose your password</DialogTitle>
          </div>
          <DialogDescription className="pt-1">
            You&apos;re signed in with a temporary passphrase an executive gave you. Pick your own
            password to carry on — it only takes a moment, and the temporary one stops working.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cpd-current">Temporary passphrase</Label>
            <Input
              id="cpd-current"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              placeholder="the words you were given"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpd-new">New password</Label>
            <Input
              id="cpd-new"
              name="newPassword"
              type="password"
              required
              minLength={MIN_LENGTH}
              autoComplete="new-password"
              placeholder={`At least ${MIN_LENGTH} characters`}
            />
            <p className="text-xs text-muted-foreground">
              A few unrelated words you&apos;ll remember beats a short one with symbols in it.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpd-confirm">Confirm new password</Label>
            <Input
              id="cpd-confirm"
              name="confirmPassword"
              type="password"
              required
              minLength={MIN_LENGTH}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full mt-1" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              "Set password"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
