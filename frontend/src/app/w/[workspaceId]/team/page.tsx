"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOutIcon, MailIcon, UserMinusIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { useCurrentWorkspace } from "@/components/layout/workspace-context";
import { useAuth } from "@/components/providers/auth-provider";
import { InviteDialog } from "@/components/team/invite-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import { assignableRoles, can, canManageMember, formatDateTime, ROLE_LABEL, timeAgo } from "@/lib/format";
import { useInvitations, useMembers } from "@/lib/queries";
import type { InviteFormValues } from "@/lib/schemas";
import type { Invitation, Role } from "@/lib/types";

const ROLE_HELP: Record<Role, string> = {
  OWNER: "Full access, including deleting the workspace",
  ADMIN: "Manages team, notifications and the status page",
  MEMBER: "Manages monitors and incidents",
  VIEWER: "Read-only access",
};

export default function TeamPage() {
  const ws = useCurrentWorkspace();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const isAdmin = can(ws.role, "ADMIN");
  const members = useMembers(ws.id);
  const invitations = useInvitations(ws.id, isAdmin);
  const base = `/workspaces/${ws.id}`;
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["members", ws.id] }), qc.invalidateQueries({ queryKey: ["invitations", ws.id] })]);

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api(`${base}/members/${id}`, { method: "PATCH", body: { role } }),
    onSuccess: () => { toast.success("Role updated"); return refresh(); },
    onError,
  });
  const invite = useMutation({
    mutationFn: (v: InviteFormValues) => api<Invitation>(`${base}/invitations`, { method: "POST", body: v }),
    onSuccess: () => refresh(),
    onError,
  });
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
    } catch (e) {
      onError(e);
      throw e;
    }
  };

  const leave = () =>
    run(() => api(`${base}/leave`, { method: "POST" }), `You left ${ws.name}`).then(async () => {
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.removeQueries({ queryKey: ["workspace", ws.id] });
      router.replace("/app");
    });

  return (
    <>
      <PageHeader
        title="Team"
        description="People with access to this workspace"
        actions={
          <>
            <ConfirmDialog
              trigger={<Button variant="outline"><LogOutIcon /> Leave workspace</Button>}
              title={`Leave ${ws.name}?`}
              description="You lose access immediately. A workspace must keep at least one owner."
              confirmLabel="Leave"
              onConfirm={leave}
            />
            {isAdmin && <InviteDialog actorRole={ws.role} onInvite={(v) => invite.mutateAsync(v)} />}
          </>
        }
      />

      <Card className="gap-3">
        <CardHeader><CardTitle className="text-base">Members</CardTitle></CardHeader>
        <CardContent className="px-0">
          {members.isPending ? (
            <div className="px-6"><ListSkeleton rows={3} /></div>
          ) : members.error ? (
            <div className="px-6"><ErrorState error={members.error} onRetry={() => members.refetch()} /></div>
          ) : (
            <ul className="divide-y">
              {members.data.map((m) => {
                const self = m.user.id === user?.id;
                const manageable = !self && canManageMember(ws.role, m.role);
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
                    <div className="bg-muted grid size-9 shrink-0 place-items-center rounded-full text-xs font-medium uppercase" aria-hidden>
                      {m.user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{m.user.name} {self && <Badge variant="secondary" className="ms-1 font-normal">You</Badge>}</div>
                      <div className="text-muted-foreground truncate text-xs">{m.user.email} · joined {formatDateTime(m.joinedAt)}</div>
                    </div>
                    {manageable ? (
                      <Select value={m.role} onValueChange={(r) => changeRole.mutate({ id: m.id, role: r as Role })} disabled={changeRole.isPending}>
                        <SelectTrigger className="w-32" aria-label={`Role of ${m.user.name}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {assignableRoles(ws.role).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground w-32 text-sm" title={ROLE_HELP[m.role]}>{ROLE_LABEL[m.role]}</span>
                    )}
                    {manageable ? (
                      <ConfirmDialog
                        trigger={<Button variant="ghost" size="icon" className="text-destructive" aria-label={`Remove ${m.user.name}`}><UserMinusIcon /></Button>}
                        title={`Remove ${m.user.name}?`}
                        description="They lose access to this workspace immediately."
                        confirmLabel="Remove"
                        onConfirm={() => run(() => api(`${base}/members/${m.id}`, { method: "DELETE" }), `${m.user.name} removed`).then(refresh)}
                      />
                    ) : (
                      isAdmin && <span className="size-9" aria-hidden />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="mt-4 gap-3">
          <CardHeader>
            <CardTitle className="text-base">Pending invitations</CardTitle>
            <CardDescription>Invitations expire after 7 days and can be used once.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {invitations.isPending ? (
              <div className="px-6"><ListSkeleton rows={2} /></div>
            ) : invitations.error ? (
              <div className="px-6"><ErrorState error={invitations.error} onRetry={() => invitations.refetch()} /></div>
            ) : invitations.data.length === 0 ? (
              <p className="text-muted-foreground px-6 text-sm">No pending invitations.</p>
            ) : (
              <ul className="divide-y">
                {invitations.data.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
                    <MailIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{inv.email}</div>
                      <div className="text-muted-foreground text-xs">Invited by {inv.invitedBy.name} {timeAgo(inv.createdAt)} · expires {timeAgo(inv.expiresAt)}</div>
                    </div>
                    <span className="text-muted-foreground w-32 text-sm">{ROLE_LABEL[inv.role]}</span>
                    <ConfirmDialog
                      trigger={<Button variant="ghost" size="icon" aria-label={`Revoke invitation for ${inv.email}`}><XIcon /></Button>}
                      title="Revoke invitation?"
                      description={`The link sent to ${inv.email} stops working.`}
                      confirmLabel="Revoke"
                      onConfirm={() => run(() => api(`${base}/invitations/${inv.id}`, { method: "DELETE" }), "Invitation revoked").then(refresh)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
