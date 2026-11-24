import { describe, expect, it } from "vitest";
import {
  assignableRoles, can, canManageMember, formatDuration, formatInterval, formatMs, formatPercent, formatStatusCodes, parseStatusCodes, timeAgo,
} from "./format";

describe("parseStatusCodes / formatStatusCodes", () => {
  it("parses single codes and ranges, sorted and de-duplicated", () => {
    expect(parseStatusCodes("204, 200-202, 201")).toEqual([200, 201, 202, 204]);
  });

  it.each(["", "abc", "99", "600", "300-200", "200-700", "20x"])("rejects %j", (input) => {
    expect(parseStatusCodes(input)).toBeNull();
  });

  it("round-trips through the compact format", () => {
    expect(formatStatusCodes([204, 200, 201, 202, 301])).toBe("200-202, 204, 301");
    expect(parseStatusCodes(formatStatusCodes([200, 201, 202, 204]))).toEqual([200, 201, 202, 204]);
  });
});

describe("role helpers mirror the API team policy", () => {
  it("can() compares role rank", () => {
    expect(can("ADMIN", "MEMBER")).toBe(true);
    expect(can("VIEWER", "MEMBER")).toBe(false);
    expect(can(undefined, "VIEWER")).toBe(false);
  });

  it("owners manage everyone, admins only strictly lower roles, members nobody", () => {
    expect(canManageMember("OWNER", "OWNER")).toBe(true);
    expect(canManageMember("ADMIN", "MEMBER")).toBe(true);
    expect(canManageMember("ADMIN", "ADMIN")).toBe(false);
    expect(canManageMember("ADMIN", "OWNER")).toBe(false);
    expect(canManageMember("MEMBER", "VIEWER")).toBe(false);
  });

  it("never offers a role above the actor's own", () => {
    expect(assignableRoles("OWNER")).toEqual(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
    expect(assignableRoles("ADMIN")).toEqual(["ADMIN", "MEMBER", "VIEWER"]);
  });
});

describe("formatters", () => {
  it("formats numbers with fallbacks", () => {
    expect(formatPercent(99.456)).toBe("99.46%");
    expect(formatPercent(null)).toBe("—");
    expect(formatMs(845.6)).toBe("846 ms");
    expect(formatMs(1500)).toBe("1.50 s");
    expect(formatMs(undefined)).toBe("—");
  });

  it("formats intervals and durations", () => {
    expect(formatInterval(30)).toBe("30s");
    expect(formatInterval(300)).toBe("5m");
    expect(formatInterval(7200)).toBe("2h");
    expect(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T00:42:00Z")).toBe("42m");
    expect(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T03:05:00Z")).toBe("3h 5m");
    expect(formatDuration("2026-01-01T00:00:00Z", "2026-01-04T02:00:00Z")).toBe("3d 2h");
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(timeAgo(null)).toBe("never");
    expect(timeAgo("2026-01-01T11:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-01-01T11:55:00Z", now)).toBe("5 minutes ago");
    expect(timeAgo("2026-01-01T09:00:00Z", now)).toBe("3 hours ago");
    expect(timeAgo("2025-12-30T12:00:00Z", now)).toBe("2 days ago");
  });
});
