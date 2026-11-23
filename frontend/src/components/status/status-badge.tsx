import { CheckCircle2Icon, CircleDashedIcon, PauseCircleIcon, XCircleIcon, type LucideIcon } from "lucide-react";
import type { IncidentSeverity, IncidentStatus, MonitorStatus } from "@/lib/types";
import { INCIDENT_STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Status color + icon + label together, so state never relies on color alone. */
const MONITOR: Record<MonitorStatus, { label: string; icon: LucideIcon; color: string }> = {
  up: { label: "Up", icon: CheckCircle2Icon, color: "text-status-good" },
  down: { label: "Down", icon: XCircleIcon, color: "text-status-critical" },
  pending: { label: "Pending", icon: CircleDashedIcon, color: "text-muted-foreground" },
  paused: { label: "Paused", icon: PauseCircleIcon, color: "text-muted-foreground" },
};

export function MonitorStatusBadge({ status, className }: { status: MonitorStatus; className?: string }) {
  const s = MONITOR[status];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", className)}>
      <Icon className={cn("size-4", s.color)} aria-hidden />
      {s.label}
    </span>
  );
}

export function StatusDot({ status }: { status: MonitorStatus }) {
  const color = status === "up" ? "bg-status-good" : status === "down" ? "bg-status-critical" : "bg-status-neutral";
  return (
    <span className="relative flex size-2.5" aria-hidden>
      {status === "down" && <span className="bg-status-critical absolute inline-flex size-full animate-ping rounded-full opacity-60" />}
      <span className={cn("relative inline-flex size-2.5 rounded-full", color)} />
    </span>
  );
}

const INCIDENT_COLOR: Record<IncidentStatus, string> = {
  OPEN: "border-status-critical/40 text-status-critical",
  INVESTIGATING: "border-status-serious/50 text-status-serious",
  IDENTIFIED: "border-status-warning/60 text-amber-700 dark:text-status-warning",
  MONITORING: "border-series-1/50 text-series-1",
  RESOLVED: "border-status-good/40 text-status-good",
};

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", INCIDENT_COLOR[status])}>
      {INCIDENT_STATUS_LABEL[status]}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const cls = severity === "CRITICAL" ? "bg-status-critical/10 text-status-critical" : severity === "MAJOR" ? "bg-status-serious/10 text-status-serious" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", cls)}>{severity.charAt(0) + severity.slice(1).toLowerCase()}</span>;
}
