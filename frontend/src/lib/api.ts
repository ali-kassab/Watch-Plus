/**
 * Typed client for the PulseWatch API. All calls go to same-origin `/api/*` (proxied to NestJS
 * by next.config rewrites). The access token lives only in memory; the refresh token is an
 * httpOnly cookie the browser sends to /api/auth/refresh. A 401 triggers one single-flight
 * refresh and a retry.
 */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: string[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Envelope<T> {
  data: T;
  meta?: PageMeta;
}

export interface AuthPayload {
  user: { id: string; email: string; name: string; createdAt: string };
  accessToken: string;
  expiresIn: number;
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Skip the Authorization header and the refresh-on-401 logic. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthPayload | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

export function buildUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return `/api${path}${s ? `?${s}` : ""}`;
}

async function parse<T>(res: Response): Promise<Envelope<T>> {
  if (res.status === 204) return { data: undefined as T };
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body (e.g. proxy error page)
  }
  if (!res.ok) {
    const err = (json as { error?: ApiErrorBody } | null)?.error;
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? (res.status >= 500 ? "The server is unavailable. Please try again." : res.statusText), err?.details ?? []);
  }
  return (json ?? { data: null }) as Envelope<T>;
}

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<AuthPayload | null> {
  refreshInFlight ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then(async (res) => {
      if (!res.ok) return null;
      const { data } = await parse<AuthPayload>(res);
      setAccessToken(data.accessToken);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (!opts.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    signal: opts.signal,
  });
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<Envelope<T>> {
  let res = await send(path, opts);
  if (res.status === 401 && !opts.anonymous) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      setAccessToken(null);
      onSessionExpired?.();
      return parse<T>(res);
    }
    res = await send(path, opts);
  }
  return parse<T>(res);
}

/** Convenience wrapper returning only `data`. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await request<T>(path, opts)).data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.details.length ? `${error.message}: ${error.details.join("; ")}` : error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}
