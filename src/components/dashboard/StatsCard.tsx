import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  // kept for call-site compatibility; the design is intentionally monochrome
  color?: "blue" | "green" | "yellow" | "red" | "purple";
}

export function StatsCard({ title, value, subtitle, icon: Icon, trend }: StatsCardProps) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <Icon className="hidden sm:block h-4 w-4 shrink-0 text-zinc-400" strokeWidth={2} />
        </div>
        <p className="mt-2.5 text-[28px] leading-none font-semibold tabnums">{value}</p>
        {subtitle && <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>}
        {trend && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <span className={trend.value >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}%
            </span>
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
