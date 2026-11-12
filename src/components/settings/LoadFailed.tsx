import { Button } from "@/components/ui/button";

/** What a settings form shows when its first load fails, so it is never "Loading…" forever. */
export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-red-700">{message}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>Try again</Button>
    </div>
  );
}
