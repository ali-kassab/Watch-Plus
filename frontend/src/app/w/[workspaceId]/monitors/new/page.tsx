"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/states";
import { useCurrentWorkspace } from "@/components/layout/workspace-context";
import { MonitorForm } from "@/components/monitors/monitor-form";
import { api, errorMessage } from "@/lib/api";
import type { Monitor } from "@/lib/types";

export default function NewMonitorPage() {
  const ws = useCurrentWorkspace();
  const router = useRouter();
  const qc = useQueryClient();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New monitor" description="The first check runs within a few seconds of saving." />
      <MonitorForm
        submitLabel="Create monitor"
        onCancel={() => router.back()}
        onSubmit={async (payload) => {
          try {
            const m = await api<Monitor>(`/workspaces/${ws.id}/monitors`, { method: "POST", body: payload });
            await qc.invalidateQueries({ queryKey: ["monitors", ws.id] });
            toast.success("Monitor created");
            router.push(`/w/${ws.id}/monitors/${m.id}`);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
