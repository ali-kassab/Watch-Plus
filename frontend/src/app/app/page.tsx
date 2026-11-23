"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ErrorState, FullPageSpinner } from "@/components/common/states";
import { RequireAuth } from "@/components/layout/require-auth";
import { useWorkspaces } from "@/lib/queries";

function Redirector() {
  const router = useRouter();
  const { data, error, refetch } = useWorkspaces();
  useEffect(() => {
    if (!data) return;
    router.replace(data.length ? `/w/${data[0].id}` : "/onboarding");
  }, [data, router]);
  if (error) return <div className="p-8"><ErrorState error={error} onRetry={() => refetch()} /></div>;
  return <FullPageSpinner />;
}

/** Entry point after sign-in: sends the user to their first workspace or to onboarding. */
export default function AppEntryPage() {
  return (
    <RequireAuth>
      <Redirector />
    </RequireAuth>
  );
}
