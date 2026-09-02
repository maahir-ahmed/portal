import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NotFoundTerminal } from "@/components/shared/NotFoundTerminal";

// Root not-found: covers both a bad URL and any notFound() thrown by a page, so a
// member who follows a stale link to a deleted request lands here.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <div className="h-14 w-14 rounded-2xl bg-[#0b0b0d] flex items-center justify-center p-2.5 ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/secsoc-logo.png" alt="UNSW Security Society" className="h-full w-full object-contain" />
          </div>
          <div className="space-y-1">
            <h1 className="font-mono text-4xl font-bold tracking-tight">404</h1>
            <p className="text-sm text-muted-foreground">
              Nothing at this URL. The link may be stale, or whatever it pointed at has been deleted.
            </p>
          </div>
        </div>

        <NotFoundTerminal />

        <div className="flex justify-center">
          <Button asChild>
            <Link href="/">Back to the dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
