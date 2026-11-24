"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMs, formatPercent } from "@/lib/format";
import type { MonitorBreakdown } from "@/lib/types";
import { ChartFrame } from "./chart-frame";
import { axisProps } from "./chart-utils";
import { ChartTooltip } from "./tooltip";

/** Ranked horizontal bars, one series (slot 1), value at the tip, thin bars with rounded data-ends. */
export function MonitorLatencyBars({ data, loading }: { data?: MonitorBreakdown[]; loading?: boolean }) {
  const rows = (data ?? []).filter((m) => m.avgResponseMs != null).sort((a, b) => b.avgResponseMs! - a.avgResponseMs!).slice(0, 8);
  return (
    <ChartFrame
      title="Average response time by monitor"
      description="Slowest first"
      loading={loading}
      empty={!loading && rows.length === 0}
      table={{ columns: ["Monitor", "Average", "p95", "Uptime"], rows: (data ?? []).map((m) => [m.name, formatMs(m.avgResponseMs), formatMs(m.p95ResponseMs), formatPercent(m.uptimePercent)]) }}
    >
      <div style={{ height: Math.max(120, rows.length * 36 + 16) }} role="img" aria-label="Response time by monitor bar chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" {...axisProps} width={130} tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload }) => {
                const m = payload?.[0]?.payload as MonitorBreakdown | undefined;
                return <ChartTooltip active={active} label={m?.name} rows={m ? [
                  { color: "var(--series-1)", name: "Average", value: formatMs(m.avgResponseMs) },
                  { name: "p95", value: formatMs(m.p95ResponseMs) },
                  { name: "Uptime", value: formatPercent(m.uptimePercent) },
                ] : []} />;
              }}
            />
            <Bar dataKey="avgResponseMs" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
              <LabelList dataKey="avgResponseMs" position="right" formatter={(v) => formatMs(Number(v))} style={{ fill: "var(--chart-text)", fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
