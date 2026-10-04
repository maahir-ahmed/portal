"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/societies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description"),
        contactEmail: form.get("contactEmail"),
      }),
    });

    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      toast.success("Society created!");
      router.push(`/${data.slug}/dashboard`);
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to create society");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Set Up Your Society</h1>
          <p className="text-sm text-muted-foreground">Create your society to get started</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Society Details</CardTitle>
            <CardDescription>You&apos;ll be the first Executive of this society</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Society Name *</Label>
                <Input id="name" name="name" placeholder="e.g. UNSW PC Society" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" placeholder="Brief description of your society" rows={3} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input id="contactEmail" name="contactEmail" type="email" placeholder="contact@yoursociety.com" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating…" : "Create Society"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
