import { Suspense } from "react";
import LoginForm, { type DemoCredentials } from "./LoginForm";

// Read DEMO_MODE at request time, not build time, so one image serves both the
// real deployment and the public demo.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const demo: DemoCredentials | null =
    process.env.DEMO_MODE === "1" && process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD
      ? { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD }
      : null;

  return (
    <Suspense>
      <LoginForm demo={demo} />
    </Suspense>
  );
}
