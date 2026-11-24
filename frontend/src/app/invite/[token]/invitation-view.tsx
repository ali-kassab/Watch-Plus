"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Logo } from "@/components/common/logo";
import { ErrorState, FullPageSpinner } from "@/components/common/states";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { qk } from "@/lib/queries";

interface Preview {
  workspaceName: string;
  role: string;
  email: string;
  invitedBy: string;
  expiresAt: string;
}

export function InvitationView() {
  const { token } = useParams<{ token: string }>();
  const { status, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const preview = useQuery({ queryKey: ["invitation", token], queryFn: () => api<Preview>(`/invitations/${token}`, { anonymous: true }) });
  const accept = useMutation({
    mutationFn: () => api<{ workspaceId: string }>(`/invitations/${token}/accept`, { method: "POST" }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: qk.workspaces });
      toast.success("You joined the workspace");
      router.replace(`/w/${r.workspaceId}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (preview.isPending || status === "loading") return <FullPageSpinner />;
  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <div className="bg-muted/30 flex min-h-screen flex-col items-center justify-center px-4">
      <Logo className="mb-8" />
      {preview.error ? (
        <ErrorState error={preview.error} className="max-w-md" />
      ) : (
        <Card className="w-full max-w-md">
          <CardHeader>
            <MailCheckIcon className="text-primary mb-2 size-6" />
            <CardTitle className="text-xl">Join {preview.data.workspaceName}</CardTitle>
            <CardDescription>
              {preview.data.invitedBy} invited <strong>{preview.data.email}</strong> as {preview.data.role.toLowerCase()}. Expires {formatDateTime(preview.data.expiresAt)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {status === "authenticated"
              ? user?.email.toLowerCase() === preview.data.email.toLowerCase()
                ? "Accept to get access to the workspace."
                : `You are signed in as ${user?.email}. Sign in with ${preview.data.email} to accept.`
              : "Sign in or create an account with the invited email address to accept."}
          </CardContent>
          <CardFooter className="gap-2">
            {status === "authenticated" ? (
              <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate()}>
                {accept.isPending ? "Joining…" : "Accept invitation"}
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" className="flex-1"><Link href={`/login?next=${next}`}>Sign in</Link></Button>
                <Button asChild className="flex-1"><Link href={`/register?next=${next}`}>Create account</Link></Button>
              </>
            )}
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
