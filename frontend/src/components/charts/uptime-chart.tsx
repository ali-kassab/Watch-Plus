"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPercent } from "@/lib/format";
import type { Range, SeriesPoint } from "@/lib/types";
import { ChartFrame } from "./chart-frame";
import { axisProps, bucketLabel } from "./chart-utils";
import { ChartTooltip } from "./tooltip";

/** Single series (uptime %) over time: 2px line + 10% area wash, one axis, crosshair tooltip. */
export function UptimeChart({ data, range, loading }: { data?: SeriesPoint[]; range: Range; loading?: boolean }) {
  const points = (data ?? []).map((p) => ({ ...p, label: bucketLabel(p.bucket, range) }));
  const empty = !loading && points.every((p) => p.checks === 0);
  const min = Math.min(100, ...points.map((p) => p.uptimePercent ?? 100));
  const floor = min >= 99 ? 98 : min >= 90 ? 90 : 0;
  return (
    <ChartFrame
      title="Uptime"
      description="Share of successful checks per interval"
      loading={loading}
      empty={empty}
      table={{
        columns: ["Interval", "Uptime", "Checks", "Failures"],
        rows: points.map((p) => [p.label, formatPercent(p.uptimePercent), p.checks, p.failures]),
      }}
    >
      <div className="h-56" role="img" aria-label="Uptime over time chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis dataKey="label" {...axisProps} minTickGap={32} />
            <YAxis {...axisProps} domain={[floor, 100]} tickFormatter={(v) => `${v}%`} width={48} />
            <Tooltip
              cursor={{ stroke: "var(--chart-text)", strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                const p = payload?.[0]?.payload as (SeriesPoint & { label: string }) | undefined;
                return (
                  <ChartTooltip
                    active={active}
                    label={String(label ?? "")}
                    rows={p ? [
                      { color: "var(--series-1)", name: "Uptime", value: formatPercent(p.uptimePercent) },
                      { name: "Checks", value: `${p.checks} (${p.failures} failed)` },
                    ] : []}
                  />
                );
              }}
            />
            <Area type="monotone" dataKey="uptimePercent" stroke="var(--series-1)" strokeWidth={2} fill="var(--series-1)" fillOpacity={0.1} connectNulls={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
