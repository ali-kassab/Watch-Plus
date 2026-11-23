/** Response shapes of the PulseWatch API (see docs/API_DOCUMENTATION.md). */
export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type MonitorStatus = "up" | "down" | "pending" | "paused";
export type IncidentStatus = "OPEN" | "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED";
export type IncidentSeverity = "MINOR" | "MAJOR" | "CRITICAL";
export type NotificationEvent = "MONITOR_DOWN" | "MONITOR_RECOVERED" | "INCIDENT_UPDATED" | "TEST";
export type DeliveryStatus = "PENDING" | "SENDING" | "SUCCESS" | "FAILED";
export type Range = "24h" | "7d" | "30d" | "90d";

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
  monitorCount: number;
  memberCount: number;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: Role;
  createdAt: string;
  statusPage: { slug: string; isPublished: boolean } | null;
}

export interface Monitor {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  method: HttpMethod;
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatusCodes: number[];
  headers: Record<string, string>;
  body: string | null;
  retries: number;
  isActive: boolean;
  showOnStatusPage: boolean;
  health: "PENDING" | "UP" | "DOWN";
  status: MonitorStatus;
  lastCheckedAt: string | null;
  lastStatusCode: number | null;
  lastResponseTimeMs: number | null;
  lastError: string | null;
  healthChangedAt: string | null;
  nextCheckAt: string;
  createdAt: string;
  updatedAt: string;
  uptime24h: number | null;
  activeIncident?: { id: string; title: string; status: IncidentStatus; startedAt: string } | null;
}

export interface CheckResult {
  id: string;
  monitorId: string;
  checkedAt: string;
  success: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  errorType: string | null;
  error: string | null;
  attempts: number;
  monitor?: { id: string; name: string };
}

export interface IncidentUpdate {
  id: string;
  type: "CREATED" | "STATUS_CHANGE" | "UPDATE" | "NOTE" | "RESOLVED";
  status: IncidentStatus | null;
  message: string;
  isInternal: boolean;
  createdAt: string;
  author: { id: string; name: string } | null;
}

export interface Incident {
  id: string;
  workspaceId: string;
  monitorId: string | null;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  isAutomatic: boolean;
  isPublic: boolean;
  resolution: string | null;
  startedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  monitor: { id: string; name: string; url?: string; health?: string } | null;
  createdBy?: { id: string; name: string } | null;
  updates?: IncidentUpdate[];
  _count?: { updates: number };
}

export interface Summary {
  range: Range;
  monitors: { total: number; up: number; down: number; pending: number; paused: number };
  activeIncidents: number;
  checks: { total: number; failed: number };
  uptimePercent: number | null;
  avgResponseMs: number | null;
  p95ResponseMs: number | null;
}

export interface SeriesPoint {
  bucket: string;
  checks: number;
  failures: number;
  uptimePercent: number | null;
  avgResponseMs: number | null;
  p95ResponseMs: number | null;
}

export interface MonitorBreakdown {
  id: string;
  name: string;
  status: MonitorStatus;
  checks: number;
  uptimePercent: number | null;
  avgResponseMs: number | null;
  p95ResponseMs: number | null;
}

export interface Member {
  id: string;
  role: Role;
  joinedAt: string;
  user: { id: string; email: string; name: string };
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
  invitedBy: { name: string; email: string };
  inviteUrl?: string;
  emailSent?: boolean;
}

export interface NotificationChannel {
  id: string;
  type: "EMAIL" | "WEBHOOK";
  name: string;
  events: NotificationEvent[];
  isEnabled: boolean;
  target: { recipients?: string[]; url?: string; hasSecret?: boolean };
  createdAt: string;
  signingSecret?: string;
}

export interface Delivery {
  id: string;
  event: NotificationEvent;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  responseStatus: number | null;
  deliveredAt: string | null;
  createdAt: string;
  summary: string | null;
  channel: { id: string; name: string; type: "EMAIL" | "WEBHOOK" };
}

export interface StatusPageSettings {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublished: boolean;
}

export interface PublicIncident {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  startedAt: string;
  resolvedAt: string | null;
  affectedService: string | null;
  updates: { id: string; status: IncidentStatus | null; message: string; createdAt: string }[];
}

export interface PublicStatusPage {
  title: string;
  description: string | null;
  status: "operational" | "degraded" | "partial_outage" | "major_outage";
  services: { key: string; name: string; status: MonitorStatus; uptime90d: number | null; lastCheckedAt: string | null; history: { date: string; uptimePercent: number | null }[] }[];
  activeIncidents: PublicIncident[];
  resolvedIncidents: PublicIncident[];
  generatedAt: string;
}
