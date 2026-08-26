import Link from "next/link";
import { Button } from "@/components/ui/button";

// Root not-found: covers both a bad URL and any notFound() thrown by a page,
// so a member who follows a stale link to a deleted request lands here.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[380px] space-y-7 text-center">
        <div className="flex flex-col items-center gap-3.5">
          <div className="h-14 w-14 rounded-2xl bg-[#0b0b0d] flex items-center justify-center p-2.5 ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/secsoc-logo.png" alt="UNSW Security Society" className="h-full w-full object-contain" />
          </div>
          <div className="space-y-1">
            <p className="font-mono text-sm text-muted-foreground">404</p>
            <h1 className="text-xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
            <p className="text-sm text-muted-foreground">
              The link may be out of date, or the request it pointed at has since been deleted.
            </p>
          </div>
        </div>

        <Button asChild>
          <Link href="/">Back to the dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
