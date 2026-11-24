"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CopyButton } from "@/components/common/copy-button";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { useCurrentWorkspace } from "@/components/layout/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { can } from "@/lib/format";
import { useStatusPageSettings } from "@/lib/queries";
import { statusPageSchema, type StatusPageFormValues } from "@/lib/schemas";
import type { StatusPageSettings } from "@/lib/types";

function StatusPageForm({ ws, page, readOnly }: { ws: string; page: StatusPageSettings; readOnly: boolean }) {
  const qc = useQueryClient();
  const form = useForm<StatusPageFormValues>({
    resolver: zodResolver(statusPageSchema),
    defaultValues: { title: page.title, description: page.description ?? "", slug: page.slug, isPublished: page.isPublished },
  });
  const save = useMutation({
    mutationFn: (v: StatusPageFormValues) => {
      const p = statusPageSchema.parse(v);
      return api<StatusPageSettings>(`/workspaces/${ws}/status-page`, { method: "PATCH", body: { ...p, description: p.description || null } });
    },
    onSuccess: async (saved) => {
      toast.success("Status page saved");
      form.reset({ title: saved.title, description: saved.description ?? "", slug: saved.slug, isPublished: saved.isPublished });
      qc.setQueryData(["status-page", ws], saved);
      await qc.invalidateQueries({ queryKey: ["workspace", ws] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
            <CardDescription>Monitors marked “Show on status page” are listed as services. Public incidents and their non-internal updates are shown too.</CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset disabled={readOnly || save.isPending} className="space-y-4">
              <FormField
                control={form.control}
                name="isPublished"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Published</FormLabel>
                      <FormDescription>Unpublished pages return “not found” to visitors.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={readOnly || save.isPending} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea rows={3} placeholder="Live status of our website and API" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL slug</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <span className="text-muted-foreground bg-muted rounded-s-md border border-e-0 px-3 py-1.5 text-sm">/status/</span>
                        <Input className="rounded-s-none" {...field} />
                      </div>
                    </FormControl>
                    <FormDescription>Changing it breaks links to the old address.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>
          </CardContent>
          {!readOnly && (
            <CardFooter className="justify-end">
              <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>{save.isPending ? "Saving…" : "Save changes"}</Button>
            </CardFooter>
          )}
        </Card>
      </form>
    </Form>
  );
}

export default function StatusPageSettingsPage() {
  const ws = useCurrentWorkspace();
  const { data, error, isPending, refetch } = useStatusPageSettings(ws.id);
  const readOnly = !can(ws.role, "ADMIN");

  if (isPending) return <ListSkeleton rows={4} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  const path = `/status/${data.slug}`;
  const fullUrl = typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  return (
    <>
      <PageHeader
        title="Status page"
        description={readOnly ? "Only admins can change these settings." : "A public page showing the health of your services"}
        actions={
          data.isPublished && (
            <>
              <CopyButton value={fullUrl} label="Copy link" />
              <Button asChild variant="outline" size="sm"><Link href={path} target="_blank" rel="noopener">View page <ExternalLinkIcon /></Link></Button>
            </>
          )
        }
      />
      <div className="max-w-2xl">
        <StatusPageForm key={data.id} ws={ws.id} page={data} readOnly={readOnly} />
      </div>
    </>
  );
}
