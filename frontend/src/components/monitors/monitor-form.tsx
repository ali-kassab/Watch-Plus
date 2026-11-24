"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatStatusCodes, parseStatusCodes } from "@/lib/format";
import { BODY_METHODS, HTTP_METHODS, monitorFormSchema, type MonitorFormValues } from "@/lib/schemas";
import type { Monitor } from "@/lib/types";

export interface MonitorPayload {
  name: string;
  url: string;
  method: string;
  intervalSeconds: number;
  timeoutMs: number;
  retries: number;
  expectedStatusCodes: number[];
  headers: Record<string, string>;
  body: string | null;
  showOnStatusPage: boolean;
}

const INTERVALS = [
  { value: "30", label: "Every 30 seconds" },
  { value: "60", label: "Every minute" },
  { value: "120", label: "Every 2 minutes" },
  { value: "300", label: "Every 5 minutes" },
  { value: "600", label: "Every 10 minutes" },
  { value: "1800", label: "Every 30 minutes" },
  { value: "3600", label: "Every hour" },
];

export function toFormValues(m?: Monitor): MonitorFormValues {
  return {
    name: m?.name ?? "",
    url: m?.url ?? "https://",
    method: m?.method ?? "GET",
    intervalSeconds: m?.intervalSeconds ?? 60,
    timeoutMs: m?.timeoutMs ?? 10_000,
    retries: m?.retries ?? 1,
    expectedStatusCodes: m ? formatStatusCodes(m.expectedStatusCodes) : "200",
    headers: m ? Object.entries(m.headers).map(([name, value]) => ({ name, value })) : [],
    body: m?.body ?? "",
    showOnStatusPage: m?.showOnStatusPage ?? true,
  };
}

export function toPayload(v: MonitorFormValues): MonitorPayload {
  const parsed = monitorFormSchema.parse(v);
  return {
    name: parsed.name,
    url: parsed.url,
    method: parsed.method,
    intervalSeconds: parsed.intervalSeconds,
    timeoutMs: parsed.timeoutMs,
    retries: parsed.retries,
    expectedStatusCodes: parseStatusCodes(parsed.expectedStatusCodes)!,
    headers: Object.fromEntries(parsed.headers.filter((h) => h.name).map((h) => [h.name, h.value])),
    body: BODY_METHODS.includes(parsed.method) && parsed.body.trim() ? parsed.body : null,
    showOnStatusPage: parsed.showOnStatusPage,
  };
}

export function MonitorForm({
  initial, submitLabel, onSubmit, onCancel,
}: {
  initial?: Monitor;
  submitLabel: string;
  onSubmit: (payload: MonitorPayload) => Promise<void>;
  onCancel?: () => void;
}) {
  const form = useForm<MonitorFormValues>({ resolver: zodResolver(monitorFormSchema), defaultValues: toFormValues(initial), mode: "onTouched" });
  const headers = useFieldArray({ control: form.control, name: "headers" });
  const method = useWatch({ control: form.control, name: "method" });
  const intervalValue = String(useWatch({ control: form.control, name: "intervalSeconds" }));

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => onSubmit(toPayload(v)))} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Endpoint</CardTitle>
            <CardDescription>Only public http(s) addresses can be monitored. Private and internal networks are blocked.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem className="sm:col-span-2"><FormLabel>Name</FormLabel><FormControl><Input placeholder="Checkout API" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="url" render={({ field }) => (
              <FormItem><FormLabel>URL</FormLabel><FormControl><Input inputMode="url" placeholder="https://api.example.com/health" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="method" render={({ field }) => (
              <FormItem>
                <FormLabel>Method</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger className="w-32"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>{HTTP_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Checks</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField control={form.control} name="intervalSeconds" render={({ field }) => (
              <FormItem>
                <FormLabel>Check interval</FormLabel>
                <Select value={INTERVALS.some((i) => i.value === intervalValue) ? intervalValue : undefined} onValueChange={(v) => field.onChange(Number(v))}>
                  <FormControl><SelectTrigger className="w-full"><SelectValue placeholder={`Every ${field.value} seconds`} /></SelectTrigger></FormControl>
                  <SelectContent>{INTERVALS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="timeoutMs" render={({ field }) => (
              <FormItem>
                <FormLabel>Timeout (ms)</FormLabel>
                <FormControl><Input type="number" min={500} max={60000} step={500} {...field} value={field.value as number} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="expectedStatusCodes" render={({ field }) => (
              <FormItem>
                <FormLabel>Expected status codes</FormLabel>
                <FormControl><Input placeholder="200, 201-204" {...field} /></FormControl>
                <FormDescription>Comma separated codes or ranges. Redirects are not followed.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="retries" render={({ field }) => (
              <FormItem>
                <FormLabel>Retries before failing</FormLabel>
                <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                  <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>{[0, 1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n === 0 ? "No retries" : `${n} retr${n === 1 ? "y" : "ies"}`}</SelectItem>)}</SelectContent>
                </Select>
                <FormDescription>Failed attempts are retried immediately to avoid false alarms.</FormDescription>
              </FormItem>
            )} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
            <CardDescription>Optional headers (e.g. an API key) and a request body for {BODY_METHODS.join("/")}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {headers.fields.map((f, i) => (
                <div key={f.id} className="flex items-start gap-2">
                  <FormField control={form.control} name={`headers.${i}.name`} render={({ field }) => (
                    <FormItem className="flex-1"><FormControl><Input placeholder="Header name" aria-label={`Header ${i + 1} name`} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name={`headers.${i}.value`} render={({ field }) => (
                    <FormItem className="flex-1"><FormControl><Input placeholder="Value" aria-label={`Header ${i + 1} value`} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove header ${i + 1}`} onClick={() => headers.remove(i)}><Trash2Icon /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" disabled={headers.fields.length >= 20} onClick={() => headers.append({ name: "", value: "" })}>
                <PlusIcon /> Add header
              </Button>
            </div>
            {BODY_METHODS.includes(method) && (
              <FormField control={form.control} name="body" render={({ field }) => (
                <FormItem><FormLabel>Body</FormLabel><FormControl><Textarea rows={4} className="font-mono" placeholder='{"ping": true}' {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            )}
            <FormField control={form.control} name="showOnStatusPage" render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Show on public status page</FormLabel>
                  <FormDescription>Only the name and status are public — never the URL or headers.</FormDescription>
                </div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
          <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Saving…" : submitLabel}</Button>
        </div>
      </form>
    </Form>
  );
}
