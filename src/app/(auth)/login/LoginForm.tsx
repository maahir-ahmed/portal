"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export type DemoCredentials = { email: string; password: string };

export default function LoginForm({ demo }: { demo: DemoCredentials | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [loading, setLoading] = useState(false);

  // Demo deployments have no login step: sign in with the shared demo account on
  // mount and continue to whatever page sent us here. The credential is public by
  // design. It is only safe because the demo database holds seed data and carries
  // no Rubric credentials — see deploy/README.md.
  const demoEmail = demo?.email;
  const demoPassword = demo?.password;
  const [demoFailed, setDemoFailed] = useState(false);

  useEffect(() => {
    if (!demoEmail || !demoPassword) return;
    let cancelled = false;
    signIn("credentials", { email: demoEmail, password: demoPassword, redirect: false })
      .then((result) => {
        if (cancelled) return;
        // Fall back to the real form rather than looping, so a mis-seeded demo
        // stack is diagnosable instead of just spinning.
        if (result?.error) setDemoFailed(true);
        else router.push(callbackUrl);
      })
      .catch(() => !cancelled && setDemoFailed(true));
    return () => {
      cancelled = true;
    };
  }, [demoEmail, demoPassword, callbackUrl, router]);

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

  const signingInToDemo = !!demoEmail && !demoFailed;

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
            <p className="text-sm text-muted-foreground">
              {signingInToDemo ? "Opening the demo…" : "Sign in to the society portal"}
            </p>
          </div>
        </div>

        {signingInToDemo ? (
          <p className="text-center text-sm text-muted-foreground">
            This is a public demo with sample data. Anything you change here is not real.
          </p>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
