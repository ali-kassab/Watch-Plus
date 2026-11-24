"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CHANNEL_EVENTS, channelFormSchema, toChannelPayload, type ChannelFormValues } from "@/lib/schemas";
import type { NotificationChannel } from "@/lib/types";

export const EVENT_LABEL: Record<(typeof CHANNEL_EVENTS)[number] | "TEST", string> = {
  MONITOR_DOWN: "Monitor down",
  MONITOR_RECOVERED: "Monitor recovered",
  INCIDENT_UPDATED: "Incident updated",
  TEST: "Test",
};

export function toChannelFormValues(c?: NotificationChannel): ChannelFormValues {
  return {
    editing: !!c,
    type: c?.type ?? "EMAIL",
    name: c?.name ?? "",
    events: (c?.events.filter((e) => e !== "TEST") as ChannelFormValues["events"]) ?? [...CHANNEL_EVENTS],
    isEnabled: c?.isEnabled ?? true,
    recipients: c?.target.recipients?.join(", ") ?? "",
    url: "",
    secret: "",
  };
}

/** Create / edit dialog for an e-mail or webhook channel. Rendered only while open so the form resets each time. */
export function ChannelDialog({
  channel, onClose, onSubmit,
}: {
  channel?: NotificationChannel;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const form = useForm<ChannelFormValues>({ resolver: zodResolver(channelFormSchema), defaultValues: toChannelFormValues(channel) });
  const type = useWatch({ control: form.control, name: "type" });
  const busy = form.formState.isSubmitting;
  const editing = !!channel;

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${channel.name}` : "Add notification channel"}</DialogTitle>
          <DialogDescription>Alerts are delivered with automatic retries; every attempt appears in the delivery log.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="channel-form"
            className="space-y-4"
            noValidate
            onSubmit={form.handleSubmit(async (v) => {
              try {
                await onSubmit(toChannelPayload(v));
              } catch {
                // error toast shown by the caller's mutation
              }
            })}
          >
            {!editing && (
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="EMAIL">E-mail</SelectItem>
                        <SelectItem value="WEBHOOK">Webhook</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input placeholder={type === "EMAIL" ? "On-call e-mail" : "Slack relay"} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {type === "EMAIL" ? (
              <FormField
                control={form.control}
                name="recipients"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipients</FormLabel>
                    <FormControl><Textarea rows={2} placeholder="ops@example.com, oncall@example.com" {...field} /></FormControl>
                    <FormDescription>Up to 10 addresses, separated by commas or spaces.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Webhook URL</FormLabel>
                      <FormControl><Input type="url" placeholder={editing ? channel.target.url : "https://hooks.example.com/pulsewatch"} {...field} /></FormControl>
                      <FormDescription>{editing ? "Leave blank to keep the current URL." : "Receives a signed JSON POST for each event. Private network addresses are rejected."}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!editing && (
                  <FormField
                    control={form.control}
                    name="secret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Signing secret (optional)</FormLabel>
                        <FormControl><Input type="password" autoComplete="off" {...field} /></FormControl>
                        <FormDescription>Leave blank to generate one. It is shown only once.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}
            <FormField
              control={form.control}
              name="events"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Events</FormLabel>
                  <div className="space-y-2">
                    {CHANNEL_EVENTS.map((ev) => (
                      <label key={ev} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value.includes(ev)}
                          onCheckedChange={(c) => field.onChange(c === true ? [...field.value, ev] : field.value.filter((x) => x !== ev))}
                        />
                        {EVENT_LABEL[ev]}
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <FormLabel>Enabled</FormLabel>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="channel-form" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add channel"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
