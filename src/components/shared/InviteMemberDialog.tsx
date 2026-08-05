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

interface Department { id: string; name: string }
interface SocietyTitle { id: string; name: string; roleLevel: string }

interface InviteMemberDialogProps {
  societySlug: string;
  departments: Department[];
}

export function InviteMemberDialog({ societySlug, departments }: InviteMemberDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [titles, setTitles] = useState<SocietyTitle[]>([]);
  const [role, setRole] = useState("SUBCOMMITTEE");
  const [title, setTitle] = useState("__none__");
  const [departmentId, setDepartmentId] = useState("__none__");

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
        departmentId: departmentId === "__none__" ? null : departmentId,
      }),
    });

    setLoading(false);
    const data = await res.json();

    if (res.ok) {
      if (data.tempPassword) {
        toast.success(`Member added. Temporary password: ${data.tempPassword}`, { duration: 10000 });
      } else {
        toast.success("Member added successfully");
      }
      setOpen(false);
      setRole("SUBCOMMITTEE");
      setTitle("__none__");
      setDepartmentId("__none__");
      router.refresh();
    } else {
      toast.error(data.error ?? "Failed to add member");
    }
  }

  const titleOptions = titles.filter((t) => t.roleLevel === role);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-tour="member-invite"><UserPlus className="h-4 w-4 mr-2" /> Add Member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input id="name" name="name" placeholder="e.g. Jane Smith" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input id="email" name="email" type="email" placeholder="z1234567@ad.unsw.edu.au" required />
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
          {departments.length > 0 && (
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue placeholder="Select a department…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(No department)</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Adding…" : "Add Member"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
