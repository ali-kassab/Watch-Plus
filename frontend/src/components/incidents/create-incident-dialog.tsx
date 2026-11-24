"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { INCIDENT_STATUS_LABEL } from "@/lib/format";
import { useMonitors } from "@/lib/queries";
import { incidentFormSchema, type IncidentFormValues } from "@/lib/schemas";
import type { Incident } from "@/lib/types";

/** Radix Select items cannot use an empty value, so "no monitor" is a sentinel. */
export const NO_MONITOR = "none";

const DEFAULTS: IncidentFormValues = { title: "", severity: "MAJOR", status: "INVESTIGATING", monitorId: NO_MONITOR, message: "", isPublic: true };

export function toIncidentPayload(v: IncidentFormValues) {
  const parsed = incidentFormSchema.parse(v);
  return { ...parsed, monitorId: parsed.monitorId === NO_MONITOR ? undefined : parsed.monitorId };
}

export function CreateIncidentDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const monitors = useMonitors(workspaceId);
  const form = useForm<IncidentFormValues>({ resolver: zodResolver(incidentFormSchema), defaultValues: DEFAULTS });

  const create = useMutation({
    mutationFn: (v: IncidentFormValues) => api<Incident>(`/workspaces/${workspaceId}/incidents`, { method: "POST", body: toIncidentPayload(v) }),
    onSuccess: async (incident) => {
      toast.success("Incident created");
      setOpen(false);
      form.reset(DEFAULTS);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["incidents", workspaceId] }),
        qc.invalidateQueries({ queryKey: ["monitors", workspaceId] }),
        qc.invalidateQueries({ queryKey: ["analytics", workspaceId] }),
      ]);
      router.push(`/w/${workspaceId}/incidents/${incident.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button><PlusIcon /> New incident</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Declare an incident</DialogTitle>
          <DialogDescription>Track an outage or degradation and keep your team and status page informed.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="create-incident" className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl><Input placeholder="Elevated API error rates" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="severity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Severity</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="MINOR">Minor</SelectItem>
                        <SelectItem value="MAJOR">Major</SelectItem>
                        <SelectItem value="CRITICAL">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(["OPEN", "INVESTIGATING", "IDENTIFIED", "MONITORING"] as const).map((s) => (
                          <SelectItem key={s} value={s}>{INCIDENT_STATUS_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="monitorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Affected monitor</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={NO_MONITOR}>None</SelectItem>
                      {monitors.data?.data.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormDescription>A monitor can have only one active incident at a time.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First update</FormLabel>
                  <FormControl><Textarea rows={4} placeholder="We are investigating reports of…" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isPublic"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Show on status page</FormLabel>
                    <FormDescription>Public incidents and their non-internal updates appear on your status page.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" form="create-incident" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create incident"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
