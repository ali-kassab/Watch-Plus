# API documentation

Base URL: `http://localhost:4000/api` (the frontend proxies `/api/*` to it). Interactive Swagger UI with request
schemas: **`/api/docs`** (not served when `NODE_ENV=production`).

## Conventions

- **Authentication**: `Authorization: Bearer <accessToken>` (JWT HS256, 15 min by default). Every route requires it
  unless marked *public*. The refresh token is an httpOnly cookie `pw_refresh` scoped to `/api/auth`.
- **Success**: `{ "data": … }`; list endpoints add `"meta": { "page", "pageSize", "total", "totalPages" }` and accept
  `page` (≥ 1) and `pageSize` (1–100).
- **Errors**: `{ "error": { "statusCode", "code", "message", "details"? }, "requestId" }`. Codes include
  `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `TOO_MANY_REQUESTS`,
  `INTERNAL_ERROR`. Validation failures list each problem in `details` (e.g. `"url: Must be a valid http(s) URL"`).
- **Request id**: every response carries `X-Request-Id` (an incoming valid `X-Request-Id` is reused).
- **Bodies**: JSON, at most 100 kB. Validated with Zod; unknown fields are ignored.
- **Rate limits** (per client, per minute): 300 by default (`THROTTLE_LIMIT`); register and login 10; refresh 30;
  "check now" 10; public status page 120. Exceeding a limit returns 429.
- **Workspace routes** (`/workspaces/:workspaceId/…`): non-members get **404** (ids cannot be probed); members
  without the required role get **403**.

## Roles

| Role | Can |
|---|---|
| VIEWER | Read everything in the workspace (monitor header values are masked) |
| MEMBER | + create/edit/pause/resume/check monitors, create and update incidents |
| ADMIN | + delete monitors, manage notification channels, the status page and the team (only members ranked below them; never grant a role above their own) |
| OWNER | Everything, including other owners and deleting the workspace. A workspace always keeps at least one owner. |

## Auth — `/auth`

| Method & path | Auth | Body | Response |
|---|---|---|---|
| `POST /auth/register` | public | `{ name (1–100), email, password (8–128) }` | `201 { user, accessToken, expiresIn }` + refresh cookie |
| `POST /auth/login` | public | `{ email, password }` | `200 { user, accessToken, expiresIn }` + refresh cookie |
| `POST /auth/refresh` | public (cookie) | — | `200` same as login; rotates the cookie. Reusing an old token revokes the whole session family (10 s grace for concurrent tabs). |
| `POST /auth/logout` | public (cookie) | — | `204`, revokes the token family and clears the cookie |
| `POST /auth/logout-all` | bearer | — | `204`, revokes every session of the user |

## Users — `/users/me`

| Method & path | Body | Response |
|---|---|---|
| `GET /users/me` | — | `{ id, email, name, createdAt }` |
| `PATCH /users/me` | `{ name }` | updated user |
| `POST /users/me/password` | `{ currentPassword, newPassword }` | `204` |

## Workspaces — `/workspaces`

| Method & path | Role | Body | Response |
|---|---|---|---|
| `GET /workspaces` | any user | — | `[{ id, name, slug, role, monitorCount, memberCount, createdAt }]` |
| `POST /workspaces` | any user | `{ name (2–80) }` | the workspace; the caller becomes OWNER and an unpublished status page is created |
| `GET /workspaces/:id` | VIEWER | — | `{ id, name, slug, role, createdAt, statusPage: { slug, isPublished } }` |
| `PATCH /workspaces/:id` | ADMIN | `{ name }` | updated workspace |
| `DELETE /workspaces/:id` | OWNER | — | `204`, deletes all workspace data |

## Team

| Method & path | Role | Body | Notes |
|---|---|---|---|
| `GET /workspaces/:id/members` | VIEWER | — | `[{ id, role, joinedAt, user: { id, email, name } }]` |
| `PATCH /workspaces/:id/members/:memberId` | ADMIN | `{ role }` | team policy above |
| `DELETE /workspaces/:id/members/:memberId` | ADMIN | — | `204` |
| `POST /workspaces/:id/leave` | VIEWER | — | `204`; refused for the last owner |
| `GET /workspaces/:id/invitations` | ADMIN | — | pending, unexpired invitations |
| `POST /workspaces/:id/invitations` | ADMIN | `{ email, role = MEMBER }` | returns the invitation plus `inviteUrl` and `emailSent`; valid 7 days, single use |
| `DELETE /workspaces/:id/invitations/:invitationId` | ADMIN | — | `204`, revokes |
| `GET /invitations/:token` | public | — | preview: workspace name, inviter, role, email |
| `POST /invitations/:token/accept` | bearer | — | joins the workspace; the signed-in user's e-mail must match the invitation |

## Monitors — `/workspaces/:id/monitors`

| Method & path | Role | Notes |
|---|---|---|
| `GET /monitors` | VIEWER | Query: `status=up\|down\|pending\|paused`, `q` (name/URL search), `page`, `pageSize` (default 50). Each item includes `status`, `uptime24h` and `activeIncident`. |
| `POST /monitors` | MEMBER | Body below |
| `GET /monitors/:monitorId` | VIEWER | |
| `PATCH /monitors/:monitorId` | MEMBER | Any subset of the body fields |
| `DELETE /monitors/:monitorId` | ADMIN | `204`; deletes check history, resolves an active incident, keeps incidents |
| `POST /monitors/:monitorId/pause` · `/resume` | MEMBER | Returns the monitor |
| `POST /monitors/:monitorId/check` | MEMBER | Runs a check now and returns the check result |
| `GET /monitors/:monitorId/checks` | VIEWER | Query: `result=success\|failure`, `page`, `pageSize` (default 25) |

Monitor body:

| Field | Type / rules | Default |
|---|---|---|
| `name` | 1–100 chars | — |
| `url` | `http(s)` URL ≤ 2048, must resolve to a public address | — |
| `method` | `GET POST PUT PATCH DELETE HEAD OPTIONS` | `GET` |
| `intervalSeconds` | 10 – 86 400 | 60 |
| `timeoutMs` | 500 – 60 000, shorter than the interval | 10 000 |
| `expectedStatusCodes` | 1–100 codes, 100–599 | `[200]` |
| `headers` | object, ≤ 20 entries; no `Host`, `Content-Length`, `Connection`, `Proxy-*` …; no line breaks | `{}` |
| `body` | ≤ 10 000 chars, only for POST/PUT/PATCH/DELETE | `null` |
| `retries` | 0 – 3 | 1 |
| `isActive` (create only), `showOnStatusPage` | boolean | `true` |

## Incidents — `/workspaces/:id/incidents`

| Method & path | Role | Body / query |
|---|---|---|
| `GET /incidents` | VIEWER | `state=active\|resolved\|all` (default all), `severity`, `monitorId`, `page`, `pageSize` |
| `POST /incidents` | MEMBER | `{ title (3–200), message, severity = MAJOR, status = INVESTIGATING (not RESOLVED), monitorId?, isPublic = true }` — 409 if the monitor already has an active incident |
| `GET /incidents/:incidentId` | VIEWER | Includes `updates` (newest first), `monitor`, `createdBy` |
| `PATCH /incidents/:incidentId` | MEMBER | `{ title?, severity?, isPublic? }` |
| `POST /incidents/:incidentId/updates` | MEMBER | `{ message, status?, isInternal = false }` — internal notes cannot change the status; status `RESOLVED` resolves; resolved incidents accept internal notes only |
| `POST /incidents/:incidentId/resolve` | MEMBER | `{ resolution }` |

## Notifications — `/workspaces/:id/notifications` (ADMIN)

| Method & path | Body / query |
|---|---|
| `GET /notifications/channels` | — |
| `POST /notifications/channels` | E-mail: `{ type: "EMAIL", name, events?, isEnabled?, recipients: [1–10 e-mails] }` · Webhook: `{ type: "WEBHOOK", name, events?, isEnabled?, url, secret? (≥ 16) }` |
| `GET /notifications/channels/:channelId` | — |
| `PATCH /notifications/channels/:channelId` | `{ name?, events?, isEnabled?, recipients?, url?, rotateSecret? }` |
| `DELETE /notifications/channels/:channelId` | `204` (delivery history is deleted too) |
| `POST /notifications/channels/:channelId/test` | Sends one test delivery synchronously: `{ id, status, ok, lastError, responseStatus, deliveredAt }` |
| `GET /notifications/deliveries` | `status=PENDING\|SENDING\|SUCCESS\|FAILED`, `channelId`, `page`, `pageSize` (default 25) |

`events` ⊆ `MONITOR_DOWN`, `MONITOR_RECOVERED`, `INCIDENT_UPDATED` (default: all). Responses never contain secrets:
webhook URLs are masked (`https://host/…abcd`) and the signing secret (`whsec_…`) is returned **only** in the
response that creates it or rotates it (`signingSecret`).

### Webhook requests

`POST` to the channel URL with `Content-Type: application/json`, a 10 s timeout, and the headers
`X-PulseWatch-Event`, `X-PulseWatch-Delivery` (delivery id, stable across retries) and
`X-PulseWatch-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the signing secret>`.
Any 2xx response counts as delivered; anything else is retried (30 s, 60 s, 120 s, … capped at 1 h; 5 attempts).

```json
{
  "event": "MONITOR_DOWN",
  "occurredAt": "2026-11-24T10:00:00.000Z",
  "workspace": { "id": "…", "name": "Acme" },
  "summary": "API is DOWN: Unexpected status code 503 (expected 200)",
  "monitor": { "id": "…", "name": "API", "url": "https://api.example.com/health" },
  "incident": { "id": "…", "title": "API is down", "status": "OPEN", "severity": "MAJOR", "url": "http://localhost:3000/w/…/incidents/…" },
  "check": { "statusCode": 503, "responseTimeMs": 120, "error": "Unexpected status code 503 (expected 200)" }
}
```

Verify the signature by recomputing the HMAC over `"<t>.<body>"`, comparing in constant time and rejecting
timestamps older than ~5 minutes (reference: `backend/src/notifications/webhook-signature.ts`, `verifyWebhook`).

## Status page

| Method & path | Role | Body |
|---|---|---|
| `GET /workspaces/:id/status-page` | VIEWER | — |
| `PATCH /workspaces/:id/status-page` | ADMIN | `{ title?, description?, slug? (3–50, lowercase letters, digits, single dashes), isPublished? }` — 409 if the slug is taken |
| `GET /public/status-pages/:slug` | public | `{ title, description, status: operational\|degraded\|partial_outage\|major_outage, services[], activeIncidents[], resolvedIncidents[] (last 30 days), generatedAt }`; 404 when unknown or unpublished |

Services are monitors with `showOnStatusPage`, each with `status`, `uptime90d`, `lastCheckedAt` and a 90-entry daily
`history` of `{ date, uptimePercent | null }`. Only public incidents and non-internal updates are included; internal
names (monitor URLs, ids) are not exposed.

## Analytics — `/workspaces/:id/analytics` (VIEWER)

Query: `range=24h|7d|30d|90d` (default `24h`), optional `monitorId`.

| Path | Response |
|---|---|
| `GET /analytics/summary` | `{ range, monitors: { total, up, down, pending, paused }, activeIncidents, checks: { total, failed }, uptimePercent, avgResponseMs, p95ResponseMs }` |
| `GET /analytics/timeseries` | `[{ bucket, checks, failures, uptimePercent, avgResponseMs, p95ResponseMs }]` — hourly (24 h), 6-hourly (7 d), daily (30/90 d) |
| `GET /analytics/monitors` | per-monitor `{ id, name, status, checks, uptimePercent, avgResponseMs, p95ResponseMs }` |
| `GET /analytics/activity` | most recent checks (`limit` 1–100, default 20) |

## Health

`GET /health` → `{ status: "ok" }` (liveness, no database access). `GET /ready` → checks the database. Both are
public and not rate-limited.
