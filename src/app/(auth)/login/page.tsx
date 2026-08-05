"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const result = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      toast.error("Invalid email or password");
    } else {
      router.push(callbackUrl);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[380px] space-y-7">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <div className="h-14 w-14 rounded-2xl bg-[#0b0b0d] flex items-center justify-center p-2.5 ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/secsoc-logo.png" alt="UNSW Security Society" className="h-full w-full object-contain" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">UNSW Security Society</h1>
            <p className="text-sm text-muted-foreground">Sign in to the society portal</p>
          </div>
        </div>

        <Card className="shadow-[0_4px_24px_-8px_rgba(16,16,20,0.12)]">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" placeholder="••••••••" required autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full mt-1" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* No self-registration: accounts are created by an executive from the
            Members tab, which is the only thing that makes membership meaningful. */}
        <p className="text-center text-sm text-muted-foreground">
          Accounts are created by the executive team. Ask an exec to add you.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
