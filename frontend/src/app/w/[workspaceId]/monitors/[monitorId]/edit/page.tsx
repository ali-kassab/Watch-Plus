"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { useCurrentWorkspace } from "@/components/layout/workspace-context";
import { MonitorForm } from "@/components/monitors/monitor-form";
import { api, errorMessage } from "@/lib/api";
import { useMonitor } from "@/lib/queries";

export default function EditMonitorPage() {
  const ws = useCurrentWorkspace();
  const { monitorId } = useParams<{ monitorId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, error, isPending, refetch } = useMonitor(ws.id, monitorId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={data ? `Edit ${data.name}` : "Edit monitor"} />
      {isPending ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <MonitorForm
          initial={data}
          submitLabel="Save changes"
          onCancel={() => router.back()}
          onSubmit={async (payload) => {
            try {
              await api(`/workspaces/${ws.id}/monitors/${monitorId}`, { method: "PATCH", body: payload });
              await Promise.all([qc.invalidateQueries({ queryKey: ["monitors", ws.id] }), qc.invalidateQueries({ queryKey: ["monitor", ws.id, monitorId] })]);
              toast.success("Monitor updated");
              router.push(`/w/${ws.id}/monitors/${monitorId}`);
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
        />
      )}
    </div>
  );
}
