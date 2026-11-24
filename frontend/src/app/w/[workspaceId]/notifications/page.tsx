"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellIcon, KeyRoundIcon, MailIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SendIcon, ShieldIcon, Trash2Icon, WebhookIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Pager } from "@/components/common/pager";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { useCurrentWorkspace } from "@/components/layout/workspace-context";
import { ChannelDialog, EVENT_LABEL } from "@/components/notifications/channel-dialog";
import { SecretDialog } from "@/components/notifications/secret-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { can, formatDateTime, timeAgo } from "@/lib/format";
import { useChannels, useDeliveries } from "@/lib/queries";
import type { DeliveryStatus, NotificationChannel } from "@/lib/types";
import { cn } from "@/lib/utils";

const DELIVERY_STYLE: Record<DeliveryStatus, string> = {
  SUCCESS: "text-status-good",
  FAILED: "text-status-critical",
  PENDING: "text-muted-foreground",
  SENDING: "text-series-1",
};

function useChannelMutations(ws: string, onSecret: (s: string) => void) {
  const qc = useQueryClient();
  const base = `/workspaces/${ws}/notifications/channels`;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["channels", ws] }), qc.invalidateQueries({ queryKey: ["deliveries", ws] })]);
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const afterSave = (c: NotificationChannel, msg: string) => {
    toast.success(msg);
    if (c.signingSecret) onSecret(c.signingSecret);
    return refresh();
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<NotificationChannel>(base, { method: "POST", body }),
    onSuccess: (c) => afterSave(c, `${c.name} added`),
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api<NotificationChannel>(`${base}/${id}`, { method: "PATCH", body }),
    onSuccess: (c, { body }) => afterSave(c, body.rotateSecret ? "Signing secret rotated" : `${c.name} saved`),
    onError,
  });
  const test = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean; lastError: string | null; responseStatus: number | null }>(`${base}/${id}/test`, { method: "POST" }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Test notification delivered");
      else toast.error(`Test failed — ${r.lastError ?? (r.responseStatus ? `HTTP ${r.responseStatus}` : "unknown error")}`);
      return refresh();
    },
    onError,
  });
  const remove = async (c: NotificationChannel) => {
    try {
      await api(`${base}/${c.id}`, { method: "DELETE" });
      toast.success(`${c.name} deleted`);
      await refresh();
    } catch (e) {
      onError(e);
      throw e;
    }
  };
  return { create, update, test, remove };
}

function ChannelsTab({ ws }: { ws: string }) {
  const channels = useChannels(ws);
  const [secret, setSecret] = useState<string | null>(null);
  const [editing, setEditing] = useState<NotificationChannel | "new" | null>(null);
  const m = useChannelMutations(ws, setSecret);

  const dialog = editing && (
    <ChannelDialog
      channel={editing === "new" ? undefined : editing}
      onClose={() => setEditing(null)}
      onSubmit={async (body) => {
        if (editing === "new") await m.create.mutateAsync(body);
        else await m.update.mutateAsync({ id: editing.id, body });
        setEditing(null);
      }}
    />
  );
  const addButton = <Button onClick={() => setEditing("new")}><PlusIcon /> Add channel</Button>;

  return (
    <>
      {dialog}
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      {channels.isPending ? (
        <ListSkeleton rows={3} />
      ) : channels.error ? (
        <ErrorState error={channels.error} onRetry={() => channels.refetch()} />
      ) : channels.data.length === 0 ? (
        <EmptyState icon={BellIcon} title="No notification channels" description="Add an e-mail or webhook channel to be alerted when monitors go down or recover." action={addButton} />
      ) : (
        <>
          <div className="mb-3 flex justify-end">{addButton}</div>
          <Card className="divide-y gap-0 py-0">
            {channels.data.map((c) => {
              const Icon = c.type === "EMAIL" ? MailIcon : WebhookIcon;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {c.type === "EMAIL" ? c.target.recipients?.join(", ") : c.target.url}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.events.map((e) => <Badge key={e} variant="secondary" className="font-normal">{EVENT_LABEL[e]}</Badge>)}
                    </div>
                  </div>
                  <Switch
                    checked={c.isEnabled}
                    aria-label={`${c.isEnabled ? "Disable" : "Enable"} ${c.name}`}
                    onCheckedChange={(v) => m.update.mutate({ id: c.id, body: { isEnabled: v } })}
                  />
                  <Button variant="outline" size="sm" disabled={m.test.isPending} onClick={() => m.test.mutate(c.id)}>
                    <SendIcon /> {m.test.isPending && m.test.variables === c.id ? "Sending…" : "Test"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${c.name}`}><MoreHorizontalIcon /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(c)}><PencilIcon /> Edit</DropdownMenuItem>
                      {c.type === "WEBHOOK" && (
                        <DropdownMenuItem onClick={() => m.update.mutate({ id: c.id, body: { rotateSecret: true } })}><KeyRoundIcon /> Rotate signing secret</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ConfirmDialog
                    trigger={<Button variant="ghost" size="icon" className="text-destructive" aria-label={`Delete ${c.name}`}><Trash2Icon /></Button>}
                    title={`Delete ${c.name}?`}
                    description="Alerts will no longer be sent to this channel. Its delivery history is deleted too."
                    onConfirm={() => m.remove(c)}
                  />
                </div>
              );
            })}
          </Card>
        </>
      )}
    </>
  );
}

function DeliveriesTab({ ws }: { ws: string }) {
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const { data, error, isPending, refetch } = useDeliveries(ws, { status: status === "all" ? undefined : status, page });
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-44" aria-label="Filter by delivery status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="SUCCESS">Delivered</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="SENDING">Sending</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isPending ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.data.length === 0 ? (
        <EmptyState icon={SendIcon} title="No deliveries" description="Notifications sent to your channels appear here." />
      ) : (
        <Card className="py-2">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Created</TableHead><TableHead>Channel</TableHead><TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Details</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((d) => (
                <TableRow key={d.id}>
                  <TableCell title={formatDateTime(d.createdAt)}>{timeAgo(d.createdAt)}</TableCell>
                  <TableCell>{d.channel.name}</TableCell>
                  <TableCell>{EVENT_LABEL[d.event]}</TableCell>
                  <TableCell className={cn("font-medium", DELIVERY_STYLE[d.status])}>
                    {d.status === "SUCCESS" ? "Delivered" : d.status.charAt(0) + d.status.slice(1).toLowerCase()}
                  </TableCell>
                  <TableCell className="tabular-nums">{d.attempts}/{d.maxAttempts}</TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate" title={d.lastError ?? d.summary ?? undefined}>
                    {d.status === "PENDING" && d.attempts > 0 ? `retry ${timeAgo(d.nextAttemptAt)} · ` : ""}
                    {d.lastError ?? (d.responseStatus ? `HTTP ${d.responseStatus}` : d.summary ?? "")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-4"><Pager page={page} totalPages={data.meta?.totalPages ?? 1} onChange={setPage} /></div>
        </Card>
      )}
    </>
  );
}

export default function NotificationsPage() {
  const ws = useCurrentWorkspace();
  if (!can(ws.role, "ADMIN")) {
    return <EmptyState icon={ShieldIcon} title="Admins only" description="Ask a workspace admin or owner to manage notification channels." />;
  }
  return (
    <>
      <PageHeader title="Notifications" description="Where alerts go when monitors change state or incidents are updated" />
      <Tabs defaultValue="channels">
        <TabsList className="mb-4">
          <TabsTrigger value="channels" className="px-3">Channels</TabsTrigger>
          <TabsTrigger value="deliveries" className="px-3">Delivery log</TabsTrigger>
        </TabsList>
        <TabsContent value="channels"><ChannelsTab ws={ws.id} /></TabsContent>
        <TabsContent value="deliveries"><DeliveriesTab ws={ws.id} /></TabsContent>
      </Tabs>
    </>
  );
}
