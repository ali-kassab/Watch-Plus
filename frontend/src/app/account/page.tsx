"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Logo } from "@/components/common/logo";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/states";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { RequireAuth } from "@/components/layout/require-auth";
import { UserMenu } from "@/components/layout/user-menu";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import type { User } from "@/lib/types";

const profileSchema = z.object({ name: z.string().trim().min(1, "Name is required").max(100) });
const passwordSchema = z
  .object({ currentPassword: z.string().min(1, "Required"), newPassword: z.string().min(8, "Use at least 8 characters").max(128), confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

function Account() {
  const { user, setUser, logout } = useAuth();
  const router = useRouter();
  const profile = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { name: user?.name ?? "" } });
  const password = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { currentPassword: "", newPassword: "", confirm: "" } });

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <Logo href="/app" />
        <div className="flex-1" />
        <ThemeToggle />
        <UserMenu />
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <Button asChild variant="ghost" size="sm"><Link href="/app"><ArrowLeftIcon /> Back to app</Link></Button>
        <PageHeader title="Account" description={user?.email} />
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent>
            <Form {...profile}>
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={profile.handleSubmit(async (v) => {
                  try {
                    setUser(await api<User>("/users/me", { method: "PATCH", body: v }));
                    toast.success("Profile updated");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                })}
              >
                <FormField control={profile.control} name="name" render={({ field }) => (
                  <FormItem className="flex-1"><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" disabled={profile.formState.isSubmitting}>Save</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Changing your password signs you out on every device.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...password}>
              <form
                className="grid gap-4"
                onSubmit={password.handleSubmit(async (v) => {
                  try {
                    await api("/users/me/password", { method: "POST", body: { currentPassword: v.currentPassword, newPassword: v.newPassword } });
                    toast.success("Password changed. Please sign in again.");
                    await logout();
                    router.replace("/login");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                })}
              >
                {(["currentPassword", "newPassword", "confirm"] as const).map((name) => (
                  <FormField key={name} control={password.control} name={name} render={({ field }) => (
                    <FormItem>
                      <FormLabel>{name === "currentPassword" ? "Current password" : name === "newPassword" ? "New password" : "Confirm new password"}</FormLabel>
                      <FormControl><Input type="password" autoComplete={name === "currentPassword" ? "current-password" : "new-password"} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                ))}
                <div><Button type="submit" disabled={password.formState.isSubmitting}>Update password</Button></div>
              </form>
            </Form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>Revoke every refresh token issued to your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfirmDialog
              trigger={<Button variant="outline">Sign out everywhere</Button>}
              title="Sign out of all devices?"
              description="All sessions, including this one, will be signed out."
              confirmLabel="Sign out everywhere"
              onConfirm={async () => {
                await api("/auth/logout-all", { method: "POST" });
                await logout();
                router.replace("/login");
              }}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <Account />
    </RequireAuth>
  );
}
