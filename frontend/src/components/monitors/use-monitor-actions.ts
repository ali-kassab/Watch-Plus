"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import type { CheckResult, Monitor } from "@/lib/types";

/** Pause / resume / run-now / delete with toasts and cache invalidation. */
export function useMonitorActions(workspaceId: string) {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["monitors", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["monitor", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["checks", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["analytics", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["incidents", workspaceId] }),
    ]);
  const base = `/workspaces/${workspaceId}/monitors`;

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api<Monitor>(`${base}/${id}/${active ? "resume" : "pause"}`, { method: "POST" }),
    onSuccess: (m) => {
      toast.success(m.isActive ? `${m.name} resumed` : `${m.name} paused`);
      return refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const checkNow = useMutation({
    mutationFn: (id: string) => api<CheckResult>(`${base}/${id}/check`, { method: "POST" }),
    onSuccess: (r) => {
      if (r.success) toast.success(`Check passed — HTTP ${r.statusCode} in ${r.responseTimeMs} ms`);
      else toast.error(`Check failed — ${r.error ?? "unknown error"}`);
      return refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = async (id: string, name: string) => {
    try {
      await api(`${base}/${id}`, { method: "DELETE" });
      toast.success(`${name} deleted`);
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  };

  return { setActive, checkNow, remove };
}
