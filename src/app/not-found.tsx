import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NotFoundTerminal } from "@/components/shared/NotFoundTerminal";
import { BrandMark } from "@/components/shared/BrandMark";
import { getBrand } from "@/lib/branding";

// Root not-found: covers both a bad URL and any notFound() thrown by a page, so a
// member who follows a stale link to a deleted request lands here.
export default async function NotFound() {
  const brand = await getBrand();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <BrandMark brand={brand} />
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
