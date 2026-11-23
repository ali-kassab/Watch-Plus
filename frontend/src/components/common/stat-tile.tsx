import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A hero number: when the story is one value, the number is the chart. */
export function StatTile({ label, value, hint, icon: Icon, tone, loading }: { label: string; value: string; hint?: string; icon: LucideIcon; tone?: "good" | "critical"; loading?: boolean }) {
  return (
    <Card className="gap-2 px-5 py-4">
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        {label}
        <Icon className={cn("size-4", tone === "good" && "text-status-good", tone === "critical" && "text-status-critical")} aria-hidden />
      </div>
      {loading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>}
      {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
    </Card>
  );
}
