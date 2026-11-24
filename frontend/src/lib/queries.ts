"use client";

import { useQuery } from "@tanstack/react-query";
import { api, request } from "./api";
import type {
  CheckResult, Delivery, Incident, Invitation, Member, Monitor, MonitorBreakdown, NotificationChannel, Range, SeriesPoint,
  StatusPageSettings, Summary, Workspace, WorkspaceSummary,
} from "./types";

/** Central query keys so mutations can invalidate precisely. */
export const qk = {
  workspaces: ["workspaces"] as const,
  workspace: (id: string) => ["workspace", id] as const,
  monitors: (ws: string, filters?: object) => ["monitors", ws, filters ?? {}] as const,
  monitor: (ws: string, id: string) => ["monitor", ws, id] as const,
  checks: (ws: string, id: string, page: number) => ["checks", ws, id, page] as const,
  analytics: (ws: string, kind: string, params: object) => ["analytics", ws, kind, params] as const,
  incidents: (ws: string, filters?: object) => ["incidents", ws, filters ?? {}] as const,
  incident: (ws: string, id: string) => ["incident", ws, id] as const,
  members: (ws: string) => ["members", ws] as const,
  invitations: (ws: string) => ["invitations", ws] as const,
  channels: (ws: string) => ["channels", ws] as const,
  deliveries: (ws: string, filters?: object) => ["deliveries", ws, filters ?? {}] as const,
  statusPage: (ws: string) => ["status-page", ws] as const,
};

const LIVE = 15_000;

export const useWorkspaces = () => useQuery({ queryKey: qk.workspaces, queryFn: () => api<WorkspaceSummary[]>("/workspaces") });
export const useWorkspace = (id: string) => useQuery({ queryKey: qk.workspace(id), queryFn: () => api<Workspace>(`/workspaces/${id}`) });

export function useMonitors(ws: string, filters: { status?: string; q?: string; page?: number } = {}) {
  return useQuery({
    queryKey: qk.monitors(ws, filters),
    queryFn: () => request<Monitor[]>(`/workspaces/${ws}/monitors`, { query: { pageSize: 50, ...filters } }),
    refetchInterval: LIVE,
  });
}

export const useMonitor = (ws: string, id: string) =>
  useQuery({ queryKey: qk.monitor(ws, id), queryFn: () => api<Monitor>(`/workspaces/${ws}/monitors/${id}`), refetchInterval: LIVE });

export const useChecks = (ws: string, id: string, page: number) =>
  useQuery({
    queryKey: qk.checks(ws, id, page),
    queryFn: () => request<CheckResult[]>(`/workspaces/${ws}/monitors/${id}/checks`, { query: { page, pageSize: 15 } }),
    refetchInterval: LIVE,
  });

export const useSummary = (ws: string, range: Range, monitorId?: string) =>
  useQuery({
    queryKey: qk.analytics(ws, "summary", { range, monitorId }),
    queryFn: () => api<Summary>(`/workspaces/${ws}/analytics/summary`, { query: { range, monitorId } }),
    refetchInterval: LIVE,
  });

export const useTimeseries = (ws: string, range: Range, monitorId?: string) =>
  useQuery({
    queryKey: qk.analytics(ws, "timeseries", { range, monitorId }),
    queryFn: () => api<SeriesPoint[]>(`/workspaces/${ws}/analytics/timeseries`, { query: { range, monitorId } }),
    refetchInterval: 30_000,
  });

export const useBreakdown = (ws: string, range: Range) =>
  useQuery({
    queryKey: qk.analytics(ws, "monitors", { range }),
    queryFn: () => api<MonitorBreakdown[]>(`/workspaces/${ws}/analytics/monitors`, { query: { range } }),
    refetchInterval: 30_000,
  });

export const useActivity = (ws: string) =>
  useQuery({
    queryKey: qk.analytics(ws, "activity", {}),
    queryFn: () => api<CheckResult[]>(`/workspaces/${ws}/analytics/activity`, { query: { limit: 12 } }),
    refetchInterval: LIVE,
  });

export const useIncidents = (ws: string, filters: { state?: string; page?: number; monitorId?: string; severity?: string } = {}) =>
  useQuery({
    queryKey: qk.incidents(ws, filters),
    queryFn: () => request<Incident[]>(`/workspaces/${ws}/incidents`, { query: { pageSize: 20, ...filters } }),
    refetchInterval: LIVE,
  });

export const useIncident = (ws: string, id: string) =>
  useQuery({ queryKey: qk.incident(ws, id), queryFn: () => api<Incident>(`/workspaces/${ws}/incidents/${id}`), refetchInterval: LIVE });

export const useMembers = (ws: string) => useQuery({ queryKey: qk.members(ws), queryFn: () => api<Member[]>(`/workspaces/${ws}/members`) });

export const useInvitations = (ws: string, enabled: boolean) =>
  useQuery({ queryKey: qk.invitations(ws), queryFn: () => api<Invitation[]>(`/workspaces/${ws}/invitations`), enabled });

export const useChannels = (ws: string, enabled = true) =>
  useQuery({ queryKey: qk.channels(ws), queryFn: () => api<NotificationChannel[]>(`/workspaces/${ws}/notifications/channels`), enabled });

export const useDeliveries = (ws: string, filters: { status?: string; page?: number }, enabled = true) =>
  useQuery({
    queryKey: qk.deliveries(ws, filters),
    queryFn: () => request<Delivery[]>(`/workspaces/${ws}/notifications/deliveries`, { query: { pageSize: 15, ...filters } }),
    enabled,
    refetchInterval: LIVE,
  });

export const useStatusPageSettings = (ws: string) =>
  useQuery({ queryKey: qk.statusPage(ws), queryFn: () => api<StatusPageSettings>(`/workspaces/${ws}/status-page`) });
