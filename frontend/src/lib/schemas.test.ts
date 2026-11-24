import { describe, expect, it } from "vitest";
import {
  channelFormSchema, incidentUpdateFormSchema, inviteSchema, monitorFormSchema, parseRecipients, safeNextPath, statusPageSchema,
  toChannelPayload, type ChannelFormValues, type MonitorFormValues,
} from "./schemas";

describe("safeNextPath (open-redirect guard)", () => {
  it.each([
    [null, "/app"],
    ["https://evil.example", "/app"],
    ["//evil.example", "/app"],
    ["/\\evil.example", "/app"],
    ["relative", "/app"],
    ["/w/123/monitors?x=1", "/w/123/monitors?x=1"],
  ])("%j → %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

const monitor: MonitorFormValues = {
  name: "API", url: "https://api.example.com/health", method: "GET", intervalSeconds: 60, timeoutMs: 5000, retries: 1,
  expectedStatusCodes: "200", headers: [], body: "", showOnStatusPage: true,
};
const issues = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => `${i.path.join(".")}: ${i.message}`);

describe("monitorFormSchema", () => {
  it("accepts a valid monitor", () => {
    expect(monitorFormSchema.safeParse(monitor).success).toBe(true);
  });

  it("rejects non-http URLs, bad codes and a timeout not shorter than the interval", () => {
    expect(issues(monitorFormSchema.safeParse({ ...monitor, url: "ftp://x" }))).toContain("url: Enter a valid http(s) URL");
    expect(issues(monitorFormSchema.safeParse({ ...monitor, expectedStatusCodes: "2000" }))).toContain("expectedStatusCodes: Use codes like 200, 201-204");
    expect(issues(monitorFormSchema.safeParse({ ...monitor, intervalSeconds: 10, timeoutMs: 10_000 }))).toContain("timeoutMs: Timeout must be shorter than the interval");
  });

  it("rejects a body on GET and unsafe headers", () => {
    expect(issues(monitorFormSchema.safeParse({ ...monitor, body: "{}" }))).toContain("body: GET requests cannot have a body");
    const r = monitorFormSchema.safeParse({ ...monitor, headers: [{ name: "Host", value: "x" }, { name: "X-A", value: "a\r\nb" }] });
    expect(issues(r)).toEqual(expect.arrayContaining(["headers.0.name: This header cannot be set", "headers.1.value: No line breaks"]));
  });
});

describe("incidentUpdateFormSchema", () => {
  it("forbids a status change on internal notes (API rule)", () => {
    expect(incidentUpdateFormSchema.safeParse({ message: "x", status: "keep", isInternal: true }).success).toBe(true);
    expect(issues(incidentUpdateFormSchema.safeParse({ message: "x", status: "RESOLVED", isInternal: true }))).toContain("status: Internal notes cannot change the status");
  });
});

describe("notification channels", () => {
  const base: ChannelFormValues = { editing: false, type: "EMAIL", name: "Ops", events: ["MONITOR_DOWN"], isEnabled: true, recipients: "", url: "", secret: "" };

  it("parses and de-duplicates recipients", () => {
    expect(parseRecipients(" A@x.io, b@x.io;\na@x.io ")).toEqual(["a@x.io", "b@x.io"]);
  });

  it("validates e-mail and webhook channels", () => {
    expect(issues(channelFormSchema.safeParse(base))).toContain("recipients: Add at least one e-mail address");
    expect(issues(channelFormSchema.safeParse({ ...base, recipients: "nope" }))).toContain("recipients: One of the addresses is not valid");
    expect(issues(channelFormSchema.safeParse({ ...base, events: [] }))).toContain("events: Pick at least one event");
    const hook = { ...base, type: "WEBHOOK" as const };
    expect(issues(channelFormSchema.safeParse(hook))).toContain("url: Webhook URL is required");
    expect(issues(channelFormSchema.safeParse({ ...hook, url: "https://h.example/x", secret: "short" }))).toContain("secret: At least 16 characters (or leave blank to generate one)");
  });

  it("builds create payloads per type", () => {
    expect(toChannelPayload({ ...base, recipients: "a@x.io b@x.io" })).toEqual({
      type: "EMAIL", name: "Ops", events: ["MONITOR_DOWN"], isEnabled: true, recipients: ["a@x.io", "b@x.io"],
    });
    expect(toChannelPayload({ ...base, type: "WEBHOOK", url: "https://h.example/x" })).toEqual({
      type: "WEBHOOK", name: "Ops", events: ["MONITOR_DOWN"], isEnabled: true, url: "https://h.example/x",
    });
  });

  it("omits blank fields when editing so stored values are kept", () => {
    expect(toChannelPayload({ ...base, editing: true, type: "WEBHOOK" })).toEqual({ name: "Ops", events: ["MONITOR_DOWN"], isEnabled: true });
    expect(toChannelPayload({ ...base, editing: true })).toEqual({ name: "Ops", events: ["MONITOR_DOWN"], isEnabled: true });
  });
});

describe("status page and invitations", () => {
  it("normalizes and validates the slug", () => {
    expect(statusPageSchema.parse({ title: "S", description: "", slug: " Demo-Inc ", isPublished: true }).slug).toBe("demo-inc");
    expect(statusPageSchema.safeParse({ title: "S", description: "", slug: "bad--slug", isPublished: true }).success).toBe(false);
  });

  it("requires a valid invite e-mail and a known role", () => {
    expect(inviteSchema.safeParse({ email: "a@x.io", role: "ADMIN" }).success).toBe(true);
    expect(inviteSchema.safeParse({ email: "x", role: "ADMIN" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@x.io", role: "ROOT" }).success).toBe(false);
  });
});
