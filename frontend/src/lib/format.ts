import type { IncidentStatus, Role } from "./types";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return diff <= 0 ? "just now" : "in a few seconds";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatPercent(v: number | null | undefined, digits = 2): string {
  return v == null ? "—" : `${v.toFixed(digits)}%`;
}

export function formatMs(v: number | null | undefined): string {
  if (v == null) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v).toLocaleString("en")} ms`;
}

export function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function formatDuration(fromIso: string, toIso?: string | null): string {
  const ms = (toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime();
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/**
 * Days of uptime history shown below the `sm` breakpoint so status-strip cells stay readable and tappable.
 * Lives here (not in the "use client" strip component) so server components can read the value.
 */
export const MOBILE_HISTORY_DAYS = 30;

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  OPEN: "Open",
  INVESTIGATING: "Investigating",
  IDENTIFIED: "Identified",
  MONITORING: "Monitoring",
  RESOLVED: "Resolved",
};

const RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };
/** UI-only convenience; the API enforces every permission itself. */
export function can(role: Role | undefined, required: Role): boolean {
  return !!role && RANK[role] >= RANK[required];
}

/** Mirrors the API team policy: owners manage everyone, others only strictly lower roles (needs ADMIN+). */
export function canManageMember(actor: Role, target: Role): boolean {
  if (!can(actor, "ADMIN")) return false;
  return actor === "OWNER" || RANK[target] < RANK[actor];
}

/** Roles an actor may grant: never above their own. */
export function assignableRoles(actor: Role): Role[] {
  return (["OWNER", "ADMIN", "MEMBER", "VIEWER"] as Role[]).filter((r) => RANK[r] <= RANK[actor]);
}

export const ROLE_LABEL: Record<Role, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", VIEWER: "Viewer" };

/** Parses "200, 201-204" into a sorted list of unique status codes. */
export function parseStatusCodes(input: string): number[] | null {
  const out = new Set<number>();
  for (const part of input.split(",").map((s) => s.trim()).filter(Boolean)) {
    const range = /^(\d{3})\s*-\s*(\d{3})$/.exec(part);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      if (a > b || a < 100 || b > 599) return null;
      for (let c = a; c <= b; c++) out.add(c);
    } else if (/^\d{3}$/.test(part) && Number(part) >= 100 && Number(part) <= 599) {
      out.add(Number(part));
    } else {
      return null;
    }
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

/** Inverse of parseStatusCodes: compresses [200,201,202,204] into "200-202, 204". */
export function formatStatusCodes(codes: number[]): string {
  const sorted = [...codes].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : `${sorted[i]}`);
    i = j;
  }
  return parts.join(", ");
}
