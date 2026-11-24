"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMs } from "@/lib/format";
import type { Range, SeriesPoint } from "@/lib/types";
import { ChartFrame, LegendItem } from "./chart-frame";
import { axisProps, bucketLabel } from "./chart-utils";
import { ChartTooltip } from "./tooltip";

/** Average and p95 latency (same unit, one axis): series-1 and series-2, legend + tooltip. */
export function ResponseTimeChart({ data, range, loading }: { data?: SeriesPoint[]; range: Range; loading?: boolean }) {
  const points = (data ?? []).map((p) => ({ ...p, label: bucketLabel(p.bucket, range) }));
  const empty = !loading && points.every((p) => p.avgResponseMs == null);
  return (
    <ChartFrame
      title="Response time"
      description="Successful checks only"
      loading={loading}
      empty={empty}
      legend={
        <div className="mb-2 flex gap-4">
          <LegendItem color="var(--series-1)" label="Average" />
          <LegendItem color="var(--series-2)" label="p95" />
        </div>
      }
      table={{ columns: ["Interval", "Average", "p95"], rows: points.map((p) => [p.label, formatMs(p.avgResponseMs), formatMs(p.p95ResponseMs)]) }}
    >
      <div className="h-56" role="img" aria-label="Response time over time chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis dataKey="label" {...axisProps} minTickGap={32} />
            <YAxis {...axisProps} width={56} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`)} />
            <Tooltip
              cursor={{ stroke: "var(--chart-text)", strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                const p = payload?.[0]?.payload as SeriesPoint | undefined;
                return (
                  <ChartTooltip active={active} label={String(label ?? "")} rows={p ? [
                    { color: "var(--series-1)", name: "Average", value: formatMs(p.avgResponseMs) },
                    { color: "var(--series-2)", name: "p95", value: formatMs(p.p95ResponseMs) },
                  ] : []} />
                );
              }}
            />
            <Line type="monotone" dataKey="avgResponseMs" name="Average" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />
            <Line type="monotone" dataKey="p95ResponseMs" name="p95" stroke="var(--series-2)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
