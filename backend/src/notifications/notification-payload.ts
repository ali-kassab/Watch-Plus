import type { NotificationEvent } from '../generated/prisma/enums.js';

/** Event payload stored in the outbox and sent (as JSON) to webhooks. Contains no secrets. */
export interface NotificationPayload {
  event: NotificationEvent;
  occurredAt: string;
  workspace: { id: string; name: string };
  summary: string;
  monitor?: { id: string; name: string; url: string };
  incident?: { id: string; title: string; status: string; severity: string; url: string };
  check?: { statusCode: number | null; responseTimeMs: number | null; error: string | null };
  message?: string;
}

const SUBJECT: Record<NotificationEvent, string> = {
  MONITOR_DOWN: '🔴 DOWN',
  MONITOR_RECOVERED: '🟢 RECOVERED',
  INCIDENT_UPDATED: '🟠 Incident update',
  TEST: '✅ Test notification',
};

export function renderEmail(p: NotificationPayload): { subject: string; text: string } {
  const lines = [p.summary, ''];
  if (p.monitor) lines.push(`Monitor: ${p.monitor.name}`, `URL: ${p.monitor.url}`);
  if (p.check) {
    if (p.check.statusCode != null) lines.push(`Status code: ${p.check.statusCode}`);
    if (p.check.responseTimeMs != null) lines.push(`Response time: ${p.check.responseTimeMs} ms`);
    if (p.check.error) lines.push(`Error: ${p.check.error}`);
  }
  if (p.incident) lines.push('', `Incident: ${p.incident.title} [${p.incident.status}]`, p.incident.url);
  if (p.message) lines.push('', p.message);
  lines.push('', `Workspace: ${p.workspace.name}`, `Time: ${p.occurredAt}`);
  return { subject: `[PulseWatch] ${SUBJECT[p.event]}: ${p.monitor?.name ?? p.incident?.title ?? p.workspace.name}`, text: lines.join('\n') };
}
