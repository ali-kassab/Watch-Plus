import type { Range } from "@/lib/types";

export function bucketLabel(iso: string, range: Range): string {
  const d = new Date(iso);
  if (range === "24h") return d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
  if (range === "7d") return d.toLocaleString("en", { weekday: "short", hour: "2-digit" });
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

export const axisProps = {
  stroke: "var(--chart-grid)",
  tick: { fill: "var(--chart-text)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;
