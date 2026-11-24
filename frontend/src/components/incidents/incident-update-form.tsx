"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { INCIDENT_STATUS_LABEL } from "@/lib/format";
import { incidentUpdateFormSchema, type IncidentUpdateFormValues } from "@/lib/schemas";
import type { IncidentStatus } from "@/lib/types";

const STATUSES: IncidentStatus[] = ["OPEN", "INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"];
const DEFAULTS: IncidentUpdateFormValues = { message: "", status: "keep", isInternal: false };

export function toUpdatePayload(v: IncidentUpdateFormValues) {
  const p = incidentUpdateFormSchema.parse(v);
  return { message: p.message, isInternal: p.isInternal, status: p.status === "keep" ? undefined : p.status };
}

/**
 * Posts a public update (optionally changing the status) or an internal note.
 * Resolved incidents only accept internal notes (API rule), so the form is locked to notes then.
 */
export function IncidentUpdateForm({
  current, resolved, onSubmit,
}: {
  current: IncidentStatus;
  resolved: boolean;
  onSubmit: (payload: ReturnType<typeof toUpdatePayload>) => Promise<unknown>;
}) {
  const form = useForm<IncidentUpdateFormValues>({
    resolver: zodResolver(incidentUpdateFormSchema),
    defaultValues: { ...DEFAULTS, isInternal: resolved },
  });
  const isInternal = useWatch({ control: form.control, name: "isInternal" });

  return (
    <Form {...form}>
      <form
        className="space-y-3"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await onSubmit(toUpdatePayload(v));
            form.reset({ ...DEFAULTS, isInternal: resolved });
          } catch {
            // the mutation already shows the error toast; keep the draft so it can be retried
          }
        })}
      >
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">Message</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder={isInternal ? "Add a note only your team can see…" : "Share progress with your team and status page…"} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {!resolved && (
            <FormField
              control={form.control}
              name="isInternal"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(c) => {
                        field.onChange(c === true);
                        if (c === true) form.setValue("status", "keep");
                      }}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">Internal note</FormLabel>
                </FormItem>
              )}
            />
          )}
          {!resolved && !isInternal && (
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="sm:w-56">
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger className="w-full" aria-label="New status"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="keep">Keep status ({INCIDENT_STATUS_LABEL[current]})</SelectItem>
                      {STATUSES.filter((s) => s !== current).map((s) => (
                        <SelectItem key={s} value={s}>Change to {INCIDENT_STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <Button type="submit" className="sm:ml-auto" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Posting…" : isInternal ? "Add note" : "Post update"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
