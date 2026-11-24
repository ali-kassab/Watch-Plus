"use client";

import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState, ErrorState, FullPageSpinner } from "@/components/common/states";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/layout/require-auth";
import { WorkspaceProvider } from "@/components/layout/workspace-context";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useWorkspace } from "@/lib/queries";

function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data, error, isPending, refetch } = useWorkspace(workspaceId);
  if (isPending) return <FullPageSpinner />;
  if (error) {
    return (
      <div className="mx-auto max-w-lg p-8">
        {error instanceof ApiError && error.status === 404 ? (
          <EmptyState
            icon={SearchXIcon}
            title="Workspace not found"
            description="It does not exist or you are not a member of it."
            action={<Button asChild><Link href="/app">Go to my workspaces</Link></Button>}
          />
        ) : (
          <ErrorState error={error} onRetry={() => refetch()} />
        )}
      </div>
    );
  }
  return (
    <WorkspaceProvider value={data}>
      <AppShell ws={data}>{children}</AppShell>
    </WorkspaceProvider>
  );
}

export function WorkspaceRoot({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <WorkspaceGate>{children}</WorkspaceGate>
    </RequireAuth>
  );
}
