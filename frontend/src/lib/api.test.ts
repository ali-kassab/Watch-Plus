import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, buildUrl, errorMessage, getAccessToken, request, setAccessToken, setSessionExpiredHandler } from "./api";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const authPayload = { data: { user: { id: "u", email: "a@x.io", name: "A", createdAt: "" }, accessToken: "new-token", expiresIn: 900 } };

describe("api client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken("old-token");
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    setSessionExpiredHandler(null);
    setAccessToken(null);
  });

  it("builds same-origin /api URLs and skips empty query values", () => {
    expect(buildUrl("/workspaces", { page: 2, q: "", status: undefined, live: true })).toBe("/api/workspaces?page=2&live=true");
  });

  it("sends the bearer token and unwraps the data envelope", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { data: { id: 1 } }));
    await expect(api("/x")).resolves.toEqual({ id: 1 });
    const [, init] = fetchMock.mock.calls[0];
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer old-token");
    expect(init!.credentials).toBe("same-origin");
  });

  it("refreshes once on 401 for concurrent requests, then retries with the new token", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/auth/refresh") return json(200, authPayload);
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === "Bearer new-token" ? json(200, { data: url }) : json(401, { error: { statusCode: 401, code: "UNAUTHORIZED", message: "Expired" } });
    });
    const [a, b] = await Promise.all([api("/a"), api("/b")]);
    expect([a, b]).toEqual(["/api/a", "/api/b"]);
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/auth/refresh")).toHaveLength(1);
    expect(getAccessToken()).toBe("new-token");
  });

  it("clears the token and notifies when the session cannot be refreshed", async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    fetchMock.mockImplementation(async (input) =>
      String(input) === "/api/auth/refresh" ? json(401, {}) : json(401, { error: { statusCode: 401, code: "UNAUTHORIZED", message: "Expired" } }),
    );
    await expect(api("/a")).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(expired).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
  });

  it("turns API error bodies into ApiError with details", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: { statusCode: 400, code: "VALIDATION_FAILED", message: "Invalid input", details: ["url: bad"] } }));
    const err = await api("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(errorMessage(err)).toBe("Invalid input: url: bad");
  });

  it("handles 204 and non-JSON error pages", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(request("/x", { method: "DELETE" })).resolves.toEqual({ data: undefined });
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(api("/x")).rejects.toThrow("The server is unavailable. Please try again.");
  });
});
