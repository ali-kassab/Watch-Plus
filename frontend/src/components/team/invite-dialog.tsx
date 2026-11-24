"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailPlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignableRoles, ROLE_LABEL } from "@/lib/format";
import { inviteSchema, type InviteFormValues } from "@/lib/schemas";
import type { Invitation, Role } from "@/lib/types";

/** Invite form; after sending, shows the invite link so it can be shared when e-mail is not configured. */
export function InviteDialog({ actorRole, onInvite }: { actorRole: Role; onInvite: (v: InviteFormValues) => Promise<Invitation> }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<Invitation | null>(null);
  const form = useForm<InviteFormValues>({ resolver: zodResolver(inviteSchema), defaultValues: { email: "", role: "MEMBER" } });
  const busy = form.formState.isSubmitting;

  const close = (o: boolean) => {
    if (busy) return;
    // Reset when opening (not while closing) so the closing animation never flashes the empty form.
    if (o) {
      setSent(null);
      form.reset();
    }
    setOpen(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button><MailPlusIcon /> Invite member</Button>
      </DialogTrigger>
      <DialogContent>
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Invitation created</DialogTitle>
              <DialogDescription>
                {sent.emailSent ? `An e-mail was sent to ${sent.email}.` : `The e-mail to ${sent.email} could not be sent.`} You can also share this link
                — it works once and expires in 7 days.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted rounded-md p-3 font-mono text-xs break-all select-all">{sent.inviteUrl}</div>
            <DialogFooter>
              {sent.inviteUrl && <CopyButton value={sent.inviteUrl} label="Copy link" />}
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>They join this workspace with the selected role after accepting.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                id="invite-form"
                className="space-y-4"
                noValidate
                onSubmit={form.handleSubmit(async (v) => {
                  try {
                    setSent(await onInvite(v));
                  } catch {
                    // error toast shown by the caller's mutation
                  }
                })}
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" autoComplete="off" placeholder="teammate@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {assignableRoles(actorRole).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" form="invite-form" disabled={busy}>{busy ? "Sending…" : "Send invitation"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
