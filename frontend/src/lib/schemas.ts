import { z } from "zod";
import { parseStatusCodes } from "./format";

/** Client-side form schemas. They mirror the API's Zod rules; the API remains the source of truth. */
export const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

export const workspaceSchema = z.object({ name: z.string().trim().min(2, "At least 2 characters").max(80) });

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export const BODY_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/;
const FORBIDDEN_HEADERS = ["host", "content-length", "transfer-encoding", "connection", "upgrade", "te", "trailer", "keep-alive", "expect"];

export const monitorFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    url: z
      .string()
      .trim()
      .min(1, "URL is required")
      .refine((v) => {
        try {
          return ["http:", "https:"].includes(new URL(v).protocol);
        } catch {
          return false;
        }
      }, "Enter a valid http(s) URL"),
    method: z.enum(HTTP_METHODS),
    intervalSeconds: z.coerce.number<string | number>().int().min(10, "Minimum 10 seconds").max(86_400),
    timeoutMs: z.coerce.number<string | number>().int().min(500, "Minimum 500 ms").max(60_000, "Maximum 60 000 ms"),
    retries: z.coerce.number<string | number>().int().min(0).max(3),
    expectedStatusCodes: z.string().refine((v) => parseStatusCodes(v) !== null, "Use codes like 200, 201-204"),
    headers: z.array(z.object({ name: z.string().trim(), value: z.string() })).max(20),
    body: z.string().max(10_000),
    showOnStatusPage: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.body.trim() && !BODY_METHODS.includes(v.method)) {
      ctx.addIssue({ code: "custom", path: ["body"], message: `${v.method} requests cannot have a body` });
    }
    if (v.timeoutMs >= v.intervalSeconds * 1000) {
      ctx.addIssue({ code: "custom", path: ["timeoutMs"], message: "Timeout must be shorter than the interval" });
    }
    v.headers.forEach((h, i) => {
      if (!h.name && !h.value) return;
      if (!HEADER_NAME.test(h.name)) ctx.addIssue({ code: "custom", path: ["headers", i, "name"], message: "Invalid header name" });
      else if (FORBIDDEN_HEADERS.includes(h.name.toLowerCase()) || h.name.toLowerCase().startsWith("proxy-")) {
        ctx.addIssue({ code: "custom", path: ["headers", i, "name"], message: "This header cannot be set" });
      }
      if (/[\r\n]/.test(h.value)) ctx.addIssue({ code: "custom", path: ["headers", i, "value"], message: "No line breaks" });
    });
  });
export type MonitorFormValues = z.input<typeof monitorFormSchema>;

export const incidentFormSchema = z.object({
  title: z.string().trim().min(3, "At least 3 characters").max(200),
  severity: z.enum(["MINOR", "MAJOR", "CRITICAL"]),
  status: z.enum(["OPEN", "INVESTIGATING", "IDENTIFIED", "MONITORING"]),
  monitorId: z.string(),
  message: z.string().trim().min(1, "Describe what is happening").max(5000),
  isPublic: z.boolean(),
});
export type IncidentFormValues = z.infer<typeof incidentFormSchema>;

/** "keep" = post an update without changing the status. Internal notes never change the status (API rule). */
export const incidentUpdateFormSchema = z
  .object({
    message: z.string().trim().min(1, "Write an update").max(5000),
    status: z.enum(["keep", "OPEN", "INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"]),
    isInternal: z.boolean(),
  })
  .refine((v) => !(v.isInternal && v.status !== "keep"), { path: ["status"], message: "Internal notes cannot change the status" });
export type IncidentUpdateFormValues = z.infer<typeof incidentUpdateFormSchema>;

export const resolveIncidentSchema = z.object({ resolution: z.string().trim().min(1, "Describe how it was resolved").max(5000) });

export const CHANNEL_EVENTS = ["MONITOR_DOWN", "MONITOR_RECOVERED", "INCIDENT_UPDATED"] as const;

/** Splits a comma / whitespace separated list of e-mail addresses. */
export function parseRecipients(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

const isHttpUrl = (v: string) => {
  try {
    return ["http:", "https:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

/**
 * Create/edit form for notification channels. When editing a webhook the stored URL is masked by the API,
 * so `url` may be left blank to keep it (`editing: true`).
 */
export const channelFormSchema = z
  .object({
    editing: z.boolean(),
    type: z.enum(["EMAIL", "WEBHOOK"]),
    name: z.string().trim().min(1, "Name is required").max(80),
    events: z.array(z.enum(CHANNEL_EVENTS)).min(1, "Pick at least one event"),
    isEnabled: z.boolean(),
    recipients: z.string(),
    url: z.string().trim().max(2048),
    secret: z.string().trim().max(200),
  })
  .superRefine((v, ctx) => {
    if (v.type === "EMAIL") {
      const list = parseRecipients(v.recipients);
      if (list.length === 0 && !v.editing) ctx.addIssue({ code: "custom", path: ["recipients"], message: "Add at least one e-mail address" });
      else if (list.length > 10) ctx.addIssue({ code: "custom", path: ["recipients"], message: "At most 10 recipients" });
      else if (list.some((e) => !z.email().safeParse(e).success)) ctx.addIssue({ code: "custom", path: ["recipients"], message: "One of the addresses is not valid" });
    } else {
      if (!v.url && !v.editing) ctx.addIssue({ code: "custom", path: ["url"], message: "Webhook URL is required" });
      else if (v.url && !isHttpUrl(v.url)) ctx.addIssue({ code: "custom", path: ["url"], message: "Enter a valid http(s) URL" });
      if (v.secret && v.secret.length < 16) ctx.addIssue({ code: "custom", path: ["secret"], message: "At least 16 characters (or leave blank to generate one)" });
    }
  });
export type ChannelFormValues = z.infer<typeof channelFormSchema>;

/** Builds the API body: create sends the full discriminated payload, edit sends only changed/filled fields. */
export function toChannelPayload(v: ChannelFormValues): Record<string, unknown> {
  const p = channelFormSchema.parse(v);
  const base = { name: p.name, events: p.events, isEnabled: p.isEnabled };
  if (p.type === "EMAIL") {
    const recipients = parseRecipients(p.recipients);
    return p.editing ? { ...base, ...(recipients.length ? { recipients } : {}) } : { type: "EMAIL", ...base, recipients };
  }
  if (p.editing) return { ...base, ...(p.url ? { url: p.url } : {}) };
  return { type: "WEBHOOK", ...base, url: p.url, ...(p.secret ? { secret: p.secret } : {}) };
}

export const statusPageSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(100),
  description: z.string().trim().max(500),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "At least 3 characters")
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single dashes"),
  isPublished: z.boolean(),
});
export type StatusPageFormValues = z.input<typeof statusPageSchema>;

export const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export const inviteSchema = z.object({ email: z.email("Enter a valid email address"), role: z.enum(ROLES) });
export type InviteFormValues = z.infer<typeof inviteSchema>;

/** Only same-site relative paths are accepted as post-login redirects (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
