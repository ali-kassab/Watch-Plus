"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import type { Incident, IncidentSeverity, IncidentStatus } from "@/lib/types";

/** Incident mutations with toasts; every success refreshes incident, monitor and analytics caches. */
export function useIncidentActions(workspaceId: string, incidentId: string) {
  const qc = useQueryClient();
  const base = `/workspaces/${workspaceId}/incidents/${incidentId}`;
  const onSuccess = (incident: Incident) => {
    qc.setQueryData(["incident", workspaceId, incidentId], incident);
    return Promise.all([
      qc.invalidateQueries({ queryKey: ["incidents", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["monitors", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["monitor", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["analytics", workspaceId] }),
    ]);
  };
  const onError = (e: unknown) => toast.error(errorMessage(e));

  const patch = useMutation({
    mutationFn: (body: { title?: string; severity?: IncidentSeverity; isPublic?: boolean }) => api<Incident>(base, { method: "PATCH", body }),
    onSuccess: (i) => { toast.success("Incident updated"); return onSuccess(i); },
    onError,
  });

  const addUpdate = useMutation({
    mutationFn: (body: { message: string; status?: IncidentStatus; isInternal: boolean }) => api<Incident>(`${base}/updates`, { method: "POST", body }),
    onSuccess: (i) => { toast.success(i.status === "RESOLVED" ? "Incident resolved" : "Update posted"); return onSuccess(i); },
    onError,
  });

  const resolve = useMutation({
    mutationFn: (resolution: string) => api<Incident>(`${base}/resolve`, { method: "POST", body: { resolution } }),
    onSuccess: (i) => { toast.success("Incident resolved"); return onSuccess(i); },
    onError,
  });

  return { patch, addUpdate, resolve };
}
