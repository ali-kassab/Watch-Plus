"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, BotIcon, CheckCircle2Icon, GlobeIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ErrorState, ListSkeleton } from "@/components/common/states";
import { IncidentTimeline } from "@/components/incidents/incident-timeline";
import { IncidentUpdateForm } from "@/components/incidents/incident-update-form";
import { useIncidentActions } from "@/components/incidents/use-incident-actions";
import { useCurrentWorkspace } from "@/components/layout/workspace-context";
import { IncidentStatusBadge, SeverityBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { can, formatDateTime, formatDuration } from "@/lib/format";
import { useIncident } from "@/lib/queries";
import { resolveIncidentSchema } from "@/lib/schemas";
import type { IncidentSeverity } from "@/lib/types";

function ResolveDialog({ onResolve }: { onResolve: (resolution: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof resolveIncidentSchema>>({ resolver: zodResolver(resolveIncidentSchema), defaultValues: { resolution: "" } });
  const busy = form.formState.isSubmitting;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button><CheckCircle2Icon /> Resolve</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve incident</DialogTitle>
          <DialogDescription>Resolved incidents become read-only history. A recurrence opens a new incident.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="resolve-incident"
            noValidate
            onSubmit={form.handleSubmit(async (v) => {
              try {
                await onResolve(v.resolution);
                setOpen(false);
              } catch {
                // error toast shown by the mutation
              }
            })}
          >
            <FormField
              control={form.control}
              name="resolution"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resolution</FormLabel>
                  <FormControl><Textarea rows={4} placeholder="The faulty deploy was rolled back and error rates are back to normal." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button type="submit" form="resolve-incident" disabled={busy}>{busy ? "Resolving…" : "Resolve incident"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function IncidentDetailPage() {
  const ws = useCurrentWorkspace();
  const { incidentId } = useParams<{ incidentId: string }>();
  const { data: incident, error, isPending, refetch } = useIncident(ws.id, incidentId);
  const actions = useIncidentActions(ws.id, incidentId);
  const canEdit = can(ws.role, "MEMBER");

  if (isPending) return <ListSkeleton rows={6} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const resolved = incident.status === "RESOLVED";

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2"><Link href={`/w/${ws.id}/incidents`}><ArrowLeftIcon /> Incidents</Link></Button>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{incident.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <IncidentStatusBadge status={incident.status} />
            <SeverityBadge severity={incident.severity} />
            {incident.isAutomatic && <span className="text-muted-foreground inline-flex items-center gap-1 text-xs"><BotIcon className="size-3.5" aria-hidden /> Opened automatically</span>}
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              {incident.isPublic ? <><GlobeIcon className="size-3.5" aria-hidden /> Public</> : <><LockIcon className="size-3.5" aria-hidden /> Internal only</>}
            </span>
          </div>
        </div>
        {canEdit && !resolved && <ResolveDialog onResolve={(r) => actions.resolve.mutateAsync(r)} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {canEdit && (
            <Card className="gap-3">
              <CardHeader><CardTitle className="text-base">{resolved ? "Add an internal note" : "Post an update"}</CardTitle></CardHeader>
              <CardContent>
                <IncidentUpdateForm key={incident.status} current={incident.status} resolved={resolved} onSubmit={(p) => actions.addUpdate.mutateAsync(p)} />
              </CardContent>
            </Card>
          )}
          <Card className="gap-3">
            <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent><IncidentTimeline updates={incident.updates ?? []} /></CardContent>
          </Card>
        </div>

        <Card className="h-fit gap-3">
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Affected monitor</dt>
                <dd>{incident.monitor ? <Link className="hover:underline" href={`/w/${ws.id}/monitors/${incident.monitor.id}`}>{incident.monitor.name}</Link> : "None"}</dd>
              </div>
              <div><dt className="text-muted-foreground text-xs">Started</dt><dd>{formatDateTime(incident.startedAt)}</dd></div>
              {incident.resolvedAt && <div><dt className="text-muted-foreground text-xs">Resolved</dt><dd>{formatDateTime(incident.resolvedAt)}</dd></div>}
              <div><dt className="text-muted-foreground text-xs">Duration</dt><dd>{formatDuration(incident.startedAt, incident.resolvedAt)}</dd></div>
              {incident.createdBy && <div><dt className="text-muted-foreground text-xs">Declared by</dt><dd>{incident.createdBy.name}</dd></div>}
              {incident.resolution && <div><dt className="text-muted-foreground text-xs">Resolution</dt><dd className="whitespace-pre-wrap break-words">{incident.resolution}</dd></div>}
            </dl>
            {canEdit && !resolved && (
              <div className="mt-5 space-y-4 border-t pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="incident-severity">Severity</Label>
                  <Select value={incident.severity} onValueChange={(v) => actions.patch.mutate({ severity: v as IncidentSeverity })} disabled={actions.patch.isPending}>
                    <SelectTrigger id="incident-severity" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MINOR">Minor</SelectItem>
                      <SelectItem value="MAJOR">Major</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="incident-public">Show on status page</Label>
                  <Switch id="incident-public" checked={incident.isPublic} disabled={actions.patch.isPending} onCheckedChange={(c) => actions.patch.mutate({ isPublic: c })} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
