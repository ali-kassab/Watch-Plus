"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Logo } from "@/components/common/logo";
import { RequireAuth } from "@/components/layout/require-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/queries";
import { workspaceSchema } from "@/lib/schemas";

function CreateWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof workspaceSchema>>({ resolver: zodResolver(workspaceSchema), defaultValues: { name: "" } });

  async function onSubmit(v: z.infer<typeof workspaceSchema>) {
    try {
      const ws = await api<{ id: string }>("/workspaces", { method: "POST", body: v });
      await queryClient.invalidateQueries({ queryKey: qk.workspaces });
      toast.success("Workspace created");
      router.replace(`/w/${ws.id}/monitors/new`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="bg-muted/30 flex min-h-screen flex-col items-center justify-center px-4">
      <Logo href="/app" className="mb-8" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Create a workspace</CardTitle>
          <CardDescription>Workspaces hold your monitors, incidents, status page and team.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Workspace name</FormLabel>
                  <FormControl><Input placeholder="Acme Inc" autoFocus {...field} /></FormControl>
                  <FormDescription>Usually your company or team name.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating…" : "Create workspace"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <RequireAuth>
      <CreateWorkspace />
    </RequireAuth>
  );
}
