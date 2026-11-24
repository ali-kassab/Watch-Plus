"use client";

import { ActivityIcon, CheckCircle2Icon, GaugeIcon, PlusIcon, SirenIcon, TimerIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MonitorLatencyBars } from "@/components/charts/monitor-latency-bars";
import { ResponseTimeChart } from "@/components/charts/response-time-chart";
import { StatusDistribution } from "@/components/charts/status-distribution";
import { UptimeChart } from "@/components/charts/uptime-chart";
import { RangePicker } from "@/components/common/range-picker";
import { StatTile } from "@/components/common/stat-tile";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/states";
import { useCurrentWorkspace } from "@/components/layout/workspace-context";
import { MonitorStatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { can, formatMs, formatPercent, timeAgo } from "@/lib/format";
import { useActivity, useBreakdown, useMonitors, useSummary, useTimeseries } from "@/lib/queries";
import type { Range } from "@/lib/types";

const ALL = "all";

export default function DashboardPage() {
  const ws = useCurrentWorkspace();
  const [range, setRange] = useState<Range>("24h");
  const [monitorId, setMonitorId] = useState<string>(ALL);
  const selected = monitorId === ALL ? undefined : monitorId;

  const monitors = useMonitors(ws.id);
  const summary = useSummary(ws.id, range, selected);
  const series = useTimeseries(ws.id, range, selected);
  const breakdown = useBreakdown(ws.id, range);
  const activity = useActivity(ws.id);
  const s = summary.data;

  if (monitors.data && monitors.data.data.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" description={ws.name} />
        <EmptyState
          icon={ActivityIcon}
          title="No monitors yet"
          description="Add your first website or API endpoint and PulseWatch starts checking it right away."
          action={can(ws.role, "MEMBER") ? <Button asChild><Link href={`/w/${ws.id}/monitors/new`}><PlusIcon /> Create monitor</Link></Button> : undefined}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" description={`Overview of ${ws.name}`} />
      {/* Filters: one row above the charts */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <RangePicker value={range} onChange={setRange} />
        <Select value={monitorId} onValueChange={setMonitorId}>
          <SelectTrigger className="w-56" aria-label="Filter by monitor"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All monitors</SelectItem>
            {monitors.data?.data.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <StatTile label="Monitors" icon={ActivityIcon} loading={!s} value={String(s?.monitors.total ?? 0)} hint={`${s?.monitors.paused ?? 0} paused`} />
          <StatTile label="Operational" icon={CheckCircle2Icon} tone="good" loading={!s} value={String(s?.monitors.up ?? 0)} />
          <StatTile label="Down" icon={XCircleIcon} tone={s?.monitors.down ? "critical" : undefined} loading={!s} value={String(s?.monitors.down ?? 0)} />
          <StatTile label="Active incidents" icon={SirenIcon} tone={s?.activeIncidents ? "critical" : undefined} loading={!s} value={String(s?.activeIncidents ?? 0)} />
          <StatTile label={`Uptime (${range})`} icon={GaugeIcon} loading={!s} value={formatPercent(s?.uptimePercent)} hint={`${s?.checks.total ?? 0} checks`} />
          <StatTile label="Avg response" icon={TimerIcon} loading={!s} value={formatMs(s?.avgResponseMs)} hint={`p95 ${formatMs(s?.p95ResponseMs)}`} />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <UptimeChart data={series.data} range={range} loading={series.isPending} />
        <ResponseTimeChart data={series.data} range={range} loading={series.isPending} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><MonitorLatencyBars data={breakdown.data} loading={breakdown.isPending} /></div>
        <StatusDistribution summary={s} loading={summary.isPending} />
      </div>

      <Card className="mt-4 gap-3">
        <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
        <CardContent>
          {activity.isPending ? (
            <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : activity.error ? (
            <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
          ) : activity.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">No checks have run yet.</p>
          ) : (
            <ul className="divide-y">
              {activity.data.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                  <MonitorStatusBadge status={c.success ? "up" : "down"} className="w-20" />
                  <Link href={`/w/${ws.id}/monitors/${c.monitorId}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{c.monitor?.name}</Link>
                  <span className="text-muted-foreground tabular-nums">{c.statusCode ?? c.errorType ?? "—"}</span>
                  <span className="text-muted-foreground w-20 text-right tabular-nums">{formatMs(c.responseTimeMs)}</span>
                  <span className="text-muted-foreground w-28 text-right">{timeAgo(c.checkedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
