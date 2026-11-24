"use client";

import { BotIcon, CheckCircle2Icon, SirenIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CreateIncidentDialog } from "@/components/incidents/create-incident-dialog";
import { Pager } from "@/components/common/pager";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { useCurrentWorkspace } from "@/components/layout/workspace-context";
import { IncidentStatusBadge, SeverityBadge } from "@/components/status/status-badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { can, formatDateTime, formatDuration, timeAgo } from "@/lib/format";
import { useIncidents } from "@/lib/queries";

const STATES = ["active", "resolved", "all"] as const;
type State = (typeof STATES)[number];

export default function IncidentsPage() {
  const ws = useCurrentWorkspace();
  const [state, setState] = useState<State>("active");
  const [severity, setSeverity] = useState("all");
  const [page, setPage] = useState(1);
  const { data, error, isPending, refetch } = useIncidents(ws.id, { state, page, severity: severity === "all" ? undefined : severity });
  const canEdit = can(ws.role, "MEMBER");

  return (
    <>
      <PageHeader title="Incidents" description="Outages detected automatically and incidents declared by your team" actions={canEdit && <CreateIncidentDialog workspaceId={ws.id} />} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={state} onValueChange={(v) => { setState(v as State); setPage(1); }}>
          <TabsList aria-label="Filter by state">
            {STATES.map((s) => <TabsTrigger key={s} value={s} className="px-3 capitalize">{s}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(1); }}>
          <SelectTrigger className="sm:ml-auto sm:w-44" aria-label="Filter by severity"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="MAJOR">Major</SelectItem>
            <SelectItem value="MINOR">Minor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.data.length === 0 ? (
        state === "active" && severity === "all" ? (
          <EmptyState icon={CheckCircle2Icon} title="No active incidents" description="Everything is running smoothly. Incidents open automatically when a monitor goes down." />
        ) : (
          <EmptyState icon={SirenIcon} title="No incidents found" description="Try another filter." />
        )
      ) : (
        <>
          <Card className="divide-y gap-0 py-0">
            {data.data.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/w/${ws.id}/incidents/${i.id}`} className="truncate font-medium hover:underline">{i.title}</Link>
                    {i.isAutomatic && <BotIcon className="text-muted-foreground size-3.5 shrink-0" aria-label="Opened automatically" />}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {i.monitor ? i.monitor.name : "No monitor"} · started {formatDateTime(i.startedAt)}
                  </div>
                </div>
                <SeverityBadge severity={i.severity} />
                <IncidentStatusBadge status={i.status} />
                <div className="text-muted-foreground hidden w-28 text-right text-xs md:block" title="Duration">
                  {i.resolvedAt ? `lasted ${formatDuration(i.startedAt, i.resolvedAt)}` : `for ${formatDuration(i.startedAt)}`}
                </div>
                <div className="text-muted-foreground hidden w-24 text-right text-xs lg:block">{timeAgo(i.startedAt)}</div>
              </div>
            ))}
          </Card>
          <Pager page={page} totalPages={data.meta?.totalPages ?? 1} onChange={setPage} />
        </>
      )}
    </>
  );
}
