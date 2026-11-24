"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/states";
import { useCurrentWorkspace } from "@/components/layout/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { can, formatDateTime, ROLE_LABEL } from "@/lib/format";
import { workspaceSchema } from "@/lib/schemas";
import type { Workspace } from "@/lib/types";

export default function WorkspaceSettingsPage() {
  const ws = useCurrentWorkspace();
  const router = useRouter();
  const qc = useQueryClient();
  const canRename = can(ws.role, "ADMIN");
  const form = useForm<z.infer<typeof workspaceSchema>>({ resolver: zodResolver(workspaceSchema), defaultValues: { name: ws.name } });

  const rename = useMutation({
    mutationFn: (v: z.infer<typeof workspaceSchema>) => api<Workspace>(`/workspaces/${ws.id}`, { method: "PATCH", body: v }),
    onSuccess: async (updated) => {
      toast.success("Workspace renamed");
      form.reset({ name: updated.name });
      await Promise.all([qc.invalidateQueries({ queryKey: ["workspace", ws.id] }), qc.invalidateQueries({ queryKey: ["workspaces"] })]);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = async () => {
    try {
      await api(`/workspaces/${ws.id}`, { method: "DELETE" });
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
    toast.success(`${ws.name} deleted`);
    qc.removeQueries({ queryKey: ["workspace", ws.id] });
    await qc.invalidateQueries({ queryKey: ["workspaces"] });
    router.replace("/app");
  };

  return (
    <>
      <PageHeader title="Settings" description={`Workspace created ${formatDateTime(ws.createdAt)} · your role: ${ROLE_LABEL[ws.role]}`} />
      <div className="max-w-2xl space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => rename.mutate(v))} noValidate>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">General</CardTitle>
                <CardDescription>{canRename ? "Rename this workspace." : "Only admins can rename the workspace."}</CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workspace name</FormLabel>
                      <FormControl><Input disabled={!canRename || rename.isPending} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              {canRename && (
                <CardFooter className="justify-end">
                  <Button type="submit" disabled={rename.isPending || !form.formState.isDirty}>{rename.isPending ? "Saving…" : "Save"}</Button>
                </CardFooter>
              )}
            </Card>
          </form>
        </Form>

        {ws.role === "OWNER" && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive text-base">Delete workspace</CardTitle>
              <CardDescription>Permanently deletes all monitors, check history, incidents, notification channels, the status page and memberships.</CardDescription>
            </CardHeader>
            <CardFooter>
              <ConfirmDialog
                trigger={<Button variant="destructive"><Trash2Icon /> Delete workspace</Button>}
                title={`Delete ${ws.name}?`}
                description="This cannot be undone. Everyone loses access and the public status page goes offline."
                confirmLabel="Delete workspace"
                onConfirm={remove}
              />
            </CardFooter>
          </Card>
        )}
      </div>
    </>
  );
}
