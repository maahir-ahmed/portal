import { DEMO_CAPTURED_AT, demoEnabled } from "@/lib/rubricDemo";
import { Info } from "lucide-react";

// Read DEMO_MODE at request time so one image serves both deployments.
export const dynamic = "force-dynamic";

export default function RubricLayout({ children }: { children: React.ReactNode }) {
  if (!demoEnabled()) return <>{children}</>;

  return (
    <div className="space-y-4">
      {/* The demo has no Rubric session on purpose, so say what these figures are
          before anyone reads them as live. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p>
          <span className="font-semibold">Not connected to Rubric.</span>{" "}
          {DEMO_CAPTURED_AT
            ? `These figures are a snapshot taken on ${DEMO_CAPTURED_AT} and do not update.`
            : "These figures are sample data, not a real society's numbers."}{" "}
          Actions that would write back to Rubric are disabled here.
        </p>
      </div>
      {children}
    </div>
  );
}
