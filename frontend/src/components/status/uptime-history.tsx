"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type Level = "good" | "warning" | "serious" | "critical" | "none";

/**
 * Daily uptime → status level. Status colors are used only for state (dataviz Skill), always
 * paired with a text label in the legend and in each cell's tooltip / accessible name.
 */
export function uptimeLevel(p: number | null): Level {
  if (p == null) return "none";
  if (p >= 99.9) return "good";
  if (p >= 99) return "warning";
  if (p >= 95) return "serious";
  return "critical";
}

export const LEVEL: Record<Level, { label: string; cls: string }> = {
  good: { label: "Operational (≥ 99.9%)", cls: "bg-status-good" },
  warning: { label: "Minor issues (≥ 99%)", cls: "bg-status-warning" },
  serious: { label: "Degraded (≥ 95%)", cls: "bg-status-serious" },
  critical: { label: "Outage (< 95%)", cls: "bg-status-critical" },
  none: { label: "No data", cls: "bg-status-neutral/40" },
};

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** One 2px-separated cell per day; each cell is focusable and has its own hover/focus tooltip. */
export function UptimeHistory({ name, history }: { name: string; history: { date: string; uptimePercent: number | null }[] }) {
  return (
    <div role="list" aria-label={`${name}: daily uptime, last ${history.length} days`} className="flex h-8 items-stretch gap-[2px]">
      {history.map((d) => {
        const level = uptimeLevel(d.uptimePercent);
        const text = `${dateFmt.format(new Date(`${d.date}T00:00:00Z`))}: ${d.uptimePercent == null ? "no data" : `${formatPercent(d.uptimePercent)} uptime`}`;
        return (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <span
                role="listitem"
                tabIndex={0}
                aria-label={text}
                className={cn(
                  "min-w-0 flex-1 rounded-[2px] outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring",
                  LEVEL[level].cls,
                )}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="font-medium">{text}</div>
              <div className="opacity-80">{LEVEL[level].label}</div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function UptimeLegend() {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
      {(Object.keys(LEVEL) as Level[]).map((l) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[2px]", LEVEL[l].cls)} aria-hidden />
          {LEVEL[l].label}
        </li>
      ))}
    </ul>
  );
}
