"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Summary } from "@/lib/types";

const PARTS = [
  { key: "up", label: "Up", color: "var(--status-good)" },
  { key: "down", label: "Down", color: "var(--status-critical)" },
  { key: "pending", label: "Pending", color: "var(--status-neutral)" },
  { key: "paused", label: "Paused", color: "var(--muted-foreground)" },
] as const;

/** Part-to-whole of monitor states as a tall segmented bar (status colors + labels, never color alone). */
export function StatusDistribution({ summary, loading }: { summary?: Summary; loading?: boolean }) {
  const total = summary?.monitors.total ?? 0;
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Monitor status</CardTitle>
        <CardDescription>{total} monitor{total === 1 ? "" : "s"} in this workspace</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : total === 0 ? (
          <p className="text-muted-foreground text-sm">No monitors yet.</p>
        ) : (
          <>
            <div className="flex h-7 w-full gap-0.5" role="img" aria-label={PARTS.map((p) => `${summary!.monitors[p.key]} ${p.label}`).join(", ")}>
              {PARTS.filter((p) => summary!.monitors[p.key] > 0).map((p) => {
                const n = summary!.monitors[p.key];
                const pct = Math.round((n / total) * 100);
                return (
                  <Tooltip key={p.key}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center rounded-[4px] text-xs font-medium text-white" style={{ width: `${(n / total) * 100}%`, background: p.color }}>
                        {pct >= 12 ? `${pct}%` : ""}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{n} {p.label.toLowerCase()} ({pct}%)</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {PARTS.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden /> {p.label}
                  </span>
                  <span className="font-medium tabular-nums">{summary!.monitors[p.key]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
