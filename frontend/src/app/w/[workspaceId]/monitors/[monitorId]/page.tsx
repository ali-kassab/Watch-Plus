"use client";

import { ActivityIcon, ArrowLeftIcon, ExternalLinkIcon, GaugeIcon, TimerIcon, PauseIcon, PencilIcon, PlayIcon, SirenIcon, Trash2Icon, ZapIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ResponseTimeChart } from "@/components/charts/response-time-chart";
import { UptimeChart } from "@/components/charts/uptime-chart";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Pager } from "@/components/common/pager";
import { RangePicker } from "@/components/common/range-picker";
import { StatTile } from "@/components/common/stat-tile";
import { ErrorState, ListSkeleton } from "@/components/common/states";
import { useCurrentWorkspace } from "@/components/layout/workspace-context";
import { useMonitorActions } from "@/components/monitors/use-monitor-actions";
import { IncidentStatusBadge, MonitorStatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, formatDateTime, formatInterval, formatMs, formatPercent, formatStatusCodes, timeAgo } from "@/lib/format";
import { useChecks, useMonitor, useSummary, useTimeseries } from "@/lib/queries";
import type { Range } from "@/lib/types";

export default function MonitorDetailPage() {
  const ws = useCurrentWorkspace();
  const { monitorId } = useParams<{ monitorId: string }>();
  const router = useRouter();
  const [range, setRange] = useState<Range>("24h");
  const [page, setPage] = useState(1);
  const monitor = useMonitor(ws.id, monitorId);
  const summary = useSummary(ws.id, range, monitorId);
  const series = useTimeseries(ws.id, range, monitorId);
  const checks = useChecks(ws.id, monitorId, page);
  const actions = useMonitorActions(ws.id);

  if (monitor.isPending) return <ListSkeleton rows={6} />;
  if (monitor.error) return <ErrorState error={monitor.error} onRetry={() => monitor.refetch()} />;
  const m = monitor.data;
  const s = summary.data;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2"><Link href={`/w/${ws.id}/monitors`}><ArrowLeftIcon /> Monitors</Link></Button>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{m.name}</h1>
            <MonitorStatusBadge status={m.status} />
          </div>
          <a href={m.url} target="_blank" rel="noreferrer noopener" className="text-muted-foreground inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline">
            <span className="font-mono">{m.method}</span> {m.url} <ExternalLinkIcon className="size-3" />
          </a>
          <p className="text-muted-foreground text-xs">
            Every {formatInterval(m.intervalSeconds)} · timeout {formatMs(m.timeoutMs)} · expects {formatStatusCodes(m.expectedStatusCodes)} · last checked {timeAgo(m.lastCheckedAt)}
          </p>
        </div>
        {can(ws.role, "MEMBER") && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!m.isActive || actions.checkNow.isPending} onClick={() => actions.checkNow.mutate(m.id)}>
              <ZapIcon /> {actions.checkNow.isPending ? "Checking…" : "Check now"}
            </Button>
            <Button variant="outline" onClick={() => actions.setActive.mutate({ id: m.id, active: !m.isActive })}>
              {m.isActive ? <><PauseIcon /> Pause</> : <><PlayIcon /> Resume</>}
            </Button>
            <Button asChild variant="outline"><Link href={`/w/${ws.id}/monitors/${m.id}/edit`}><PencilIcon /> Edit</Link></Button>
            {can(ws.role, "ADMIN") && (
              <ConfirmDialog
                trigger={<Button variant="outline" className="text-destructive"><Trash2Icon /> Delete</Button>}
                title={`Delete ${m.name}?`}
                description="All check history is deleted permanently. Incidents are kept, and an active incident is resolved."
                onConfirm={async () => {
                  await actions.remove(m.id, m.name);
                  router.replace(`/w/${ws.id}/monitors`);
                }}
              />
            )}
          </div>
        )}
      </div>

      {m.activeIncident && (
        <Link href={`/w/${ws.id}/incidents/${m.activeIncident.id}`} className="border-status-critical/40 bg-status-critical/5 mb-6 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <SirenIcon className="text-status-critical size-4" />
          <span className="flex-1 font-medium">{m.activeIncident.title}</span>
          <IncidentStatusBadge status={m.activeIncident.status} />
          <span className="text-muted-foreground hidden sm:inline">since {timeAgo(m.activeIncident.startedAt)}</span>
        </Link>
      )}
      {m.lastError && m.status === "down" && <p className="text-status-critical mb-6 text-sm">Last error: {m.lastError}</p>}

      <div className="mb-4"><RangePicker value={range} onChange={setRange} /></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label={`Uptime (${range})`} icon={GaugeIcon} loading={!s} value={formatPercent(s?.uptimePercent)} />
        <StatTile label="Avg response" icon={TimerIcon} loading={!s} value={formatMs(s?.avgResponseMs)} />
        <StatTile label="p95 response" icon={TimerIcon} loading={!s} value={formatMs(s?.p95ResponseMs)} />
        <StatTile label="Checks" icon={ActivityIcon} loading={!s} value={String(s?.checks.total ?? 0)} hint={`${s?.checks.failed ?? 0} failed`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <UptimeChart data={series.data} range={range} loading={series.isPending} />
        <ResponseTimeChart data={series.data} range={range} loading={series.isPending} />
      </div>

      <Card className="mt-4 gap-3">
        <CardHeader><CardTitle className="text-base">Check history</CardTitle></CardHeader>
        <CardContent>
          {checks.isPending ? (
            <ListSkeleton rows={4} />
          ) : checks.error ? (
            <ErrorState error={checks.error} onRetry={() => checks.refetch()} />
          ) : checks.data.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">No checks yet — the first one runs shortly.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Time</TableHead><TableHead>Result</TableHead><TableHead>Status code</TableHead><TableHead>Response time</TableHead><TableHead>Attempts</TableHead><TableHead>Error</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {checks.data.data.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{formatDateTime(c.checkedAt)}</TableCell>
                      <TableCell><MonitorStatusBadge status={c.success ? "up" : "down"} /></TableCell>
                      <TableCell className="tabular-nums">{c.statusCode ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{formatMs(c.responseTimeMs)}</TableCell>
                      <TableCell className="tabular-nums">{c.attempts}</TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate" title={c.error ?? undefined}>{c.error ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pager page={page} totalPages={checks.data.meta?.totalPages ?? 1} onChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
