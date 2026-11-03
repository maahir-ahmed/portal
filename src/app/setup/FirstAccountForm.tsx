"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// The first account on a fresh stack, and the society it runs. See src/lib/setup.ts.
export function FirstAccountForm({ token, defaultEmail }: { token: string; defaultEmail: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("password") !== form.get("confirm")) {
      toast.error("The two passwords don't match");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        societyName: form.get("societyName"),
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    if (!res.ok) {
      setLoading(false);
      toast.error((await res.json().catch(() => ({}))).error ?? "Something went wrong. Try again.");
      return;
    }
    const signedIn = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });
    // Same page, without the token: /setup is the wizard now that an account exists.
    router.replace(signedIn?.error ? "/login?callbackUrl=/setup" : "/setup");
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Create your account</CardTitle>
        <CardDescription>
          You&apos;ll be the first executive. You can add everyone else once you&apos;re in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="societyName">Society name</Label>
            <Input id="societyName" name="societyName" placeholder="e.g. Chess Society" minLength={2} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" autoComplete="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Your email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" defaultValue={defaultEmail} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Password again</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Setting up…" : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
