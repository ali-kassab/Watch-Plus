"use client";

import { ActivityIcon, MoreHorizontalIcon, PauseIcon, PlayIcon, PlusIcon, SearchIcon, ZapIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { useCurrentWorkspace } from "@/components/layout/workspace-context";
import { useMonitorActions } from "@/components/monitors/use-monitor-actions";
import { MonitorStatusBadge, StatusDot } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { can, formatInterval, formatMs, formatPercent, timeAgo } from "@/lib/format";
import { useMonitors } from "@/lib/queries";

const FILTERS = ["all", "up", "down", "pending", "paused"] as const;

export default function MonitorsPage() {
  const ws = useCurrentWorkspace();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");
  const { data, error, isPending, refetch } = useMonitors(ws.id, { status: status === "all" ? undefined : status, q: q.trim() || undefined });
  const actions = useMonitorActions(ws.id);
  const canEdit = can(ws.role, "MEMBER");
  const filtered = status !== "all" || q.trim() !== "";

  return (
    <>
      <PageHeader
        title="Monitors"
        description="HTTP checks for your websites and APIs"
        actions={canEdit && <Button asChild><Link href={`/w/${ws.id}/monitors/new`}><PlusIcon /> New monitor</Link></Button>}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <TabsList aria-label="Filter by status">
            {FILTERS.map((f) => <TabsTrigger key={f} value={f} className="px-3 capitalize">{f}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="relative sm:ml-auto sm:w-72">
          <SearchIcon className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input className="pl-8" placeholder="Search name or URL" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search monitors" />
        </div>
      </div>

      {isPending ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.data.length === 0 ? (
        filtered ? (
          <EmptyState icon={SearchIcon} title="No matching monitors" description="Try another filter or search term." />
        ) : (
          <EmptyState
            icon={ActivityIcon}
            title="No monitors yet"
            description="Create a monitor to start checking an endpoint."
            action={canEdit && <Button asChild><Link href={`/w/${ws.id}/monitors/new`}><PlusIcon /> New monitor</Link></Button>}
          />
        )
      ) : (
        <Card className="divide-y gap-0 py-0">
          {data.data.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <StatusDot status={m.status} />
              <div className="min-w-0 flex-1">
                <Link href={`/w/${ws.id}/monitors/${m.id}`} className="font-medium hover:underline">{m.name}</Link>
                <div className="text-muted-foreground truncate text-xs">
                  <span className="font-mono">{m.method}</span> {m.url}
                </div>
              </div>
              <MonitorStatusBadge status={m.status} className="w-24" />
              <div className="text-muted-foreground hidden w-24 text-right text-sm tabular-nums md:block" title="Uptime in the last 24 hours">{formatPercent(m.uptime24h)}</div>
              <div className="text-muted-foreground hidden w-20 text-right text-sm tabular-nums md:block">{formatMs(m.lastResponseTimeMs)}</div>
              <div className="text-muted-foreground hidden w-32 text-right text-xs lg:block">
                {formatInterval(m.intervalSeconds)} · {timeAgo(m.lastCheckedAt)}
              </div>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${m.name}`}><MoreHorizontalIcon /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={!m.isActive} onClick={() => actions.checkNow.mutate(m.id)}><ZapIcon /> Check now</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => actions.setActive.mutate({ id: m.id, active: !m.isActive })}>
                      {m.isActive ? <><PauseIcon /> Pause</> : <><PlayIcon /> Resume</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild><Link href={`/w/${ws.id}/monitors/${m.id}/edit`}>Edit</Link></DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
