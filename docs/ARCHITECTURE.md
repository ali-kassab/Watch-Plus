# Architecture

PulseWatch is a **modular monolith**: one NestJS API process (which also runs the monitoring scheduler and the
notification worker) backed by PostgreSQL, and a Next.js frontend. There is no Redis or message broker; all
coordination state lives in PostgreSQL.

```
 Browser ──► Next.js (frontend, :3000) ──/api/* rewrite──► NestJS API (:4000) ──► PostgreSQL
                │                                              │
                └─ server-side fetch for /status/[slug] ───────┤
                                                               ├─ Scheduler: claims due monitors → HTTP checks
                                                               └─ Delivery worker: notification outbox → SMTP / webhooks
```

## Backend (`backend/`)

NestJS 12 (ESM, TypeScript, Express adapter), Prisma 7 (`prisma-client` generator with `@prisma/adapter-pg`).

| Module | Responsibility |
|---|---|
| `config/` | Zod-validated environment (`env.ts`), typed `AppConfig` |
| `common/` | Prisma service; HTTP layer (exception filter, `{data, meta}` envelope, request id + access log, pagination); security (AES-256-GCM, tokens); `net/` (SSRF IP policy, safe HTTP client); mail transport |
| `auth/`, `users/` | Registration, login, refresh-token rotation, logout; profile and password |
| `workspaces/`, `team/` | Workspaces, memberships, roles guard (`WorkspaceGuard`, `@MinRole`), invitations |
| `monitors/`, `monitoring/` | Monitor CRUD; scheduler, HTTP checker, check evaluation, state transitions, history pruning |
| `incidents/` | Automatic and manual incidents, lifecycle, timeline |
| `notifications/` | Channels (encrypted config), dispatcher → outbox, delivery worker with retries, webhook signing |
| `status-pages/` | Status page settings and the public status endpoint |
| `analytics/` | Summary, time series, per-monitor breakdown and recent activity (SQL aggregates) |
| `health/` | Liveness `/api/health` and readiness `/api/ready` |

Request pipeline (`bootstrap.ts`, `app.module.ts`): `/api` prefix → helmet → cookie parser → JSON body limit
100 kB → global guards: JWT auth (routes are private unless `@Public()`), then the rate limiter → `WorkspaceGuard` on
`/workspaces/:workspaceId/*` → global Zod validation (`StandardSchemaValidationPipe`) → controller. Responses are wrapped as
`{ data, meta? }`; errors as `{ error: { statusCode, code, message, details? }, requestId }`.

### Monitoring engine

1. Every `SCHEDULER_TICK_MS` the scheduler claims due monitors with one statement:
   `UPDATE monitors SET locked_until = now() + lease … WHERE id IN (SELECT … WHERE is_active AND next_check_at <= now()
   AND (locked_until IS NULL OR locked_until < now()) … FOR UPDATE SKIP LOCKED)`. Several API processes can run
   safely: a monitor is never checked twice at once, and a crashed process's lease simply expires.
2. Up to `SCHEDULER_MAX_CONCURRENCY` checks run in parallel through the SSRF-safe HTTP client (timeout, retries,
   response body capped, redirects not followed).
3. The result is evaluated (expected status codes) and written in one transaction with the monitor's new state. A
   first success makes a `PENDING` monitor `UP` silently; a failure after `UP`/`PENDING` is a real outage.
4. Transitions drive side effects in the same transaction: **went down** → open an automatic incident (or add a
   timeline entry to an already active one) and enqueue `MONITOR_DOWN` notifications; **recovered** → resolve the
   automatic incident (manual incidents only get an internal note) and enqueue `MONITOR_RECOVERED`.
5. Check history older than `CHECK_RETENTION_DAYS` is pruned hourly.

### Notifications (transactional outbox)

State changes insert rows into `notification_deliveries` in the **same transaction** as the change, one per enabled
channel subscribed to the event — so notifications are never lost and never sent for rolled-back changes. A worker
claims due rows with `FOR UPDATE SKIP LOCKED`, sends them (SMTP or signed webhook POST, 10 s timeout) and records the
outcome. Failures retry with exponential backoff 30 s · 2^(n−1), capped at 1 h, for at most 5 attempts. "Send test"
delivers one attempt synchronously. Every attempt is visible in the delivery log.

### Incidents

A partial unique index (`incidents_one_active_per_monitor`) guarantees at most one active incident per monitor, even
under concurrent checks. Resolved incidents are immutable history (only internal notes can be added); a recurrence
opens a new incident.

### Analytics

Computed on demand from `check_results` with SQL aggregates (`date_bin` buckets, `percentile_cont` for p95):
24 h → hourly buckets, 7 d → 6-hourly, 30 d / 90 d → daily. No rollup tables are needed at this scale.

## Frontend (`frontend/`)

Next.js 16 App Router with `cacheComponents` (Partial Prerendering) and React 19.

```
src/app/          routes: /, /login, /register, /onboarding, /account, /invite/[token], /app,
                  /w/[workspaceId]/{, monitors/…, incidents/…, notifications, status-page, team, settings},
                  /status/[slug] (public, server-rendered)
src/components/   ui/ (vendored shadcn/ui on Radix), common/, layout/, charts/, monitors/, incidents/,
                  notifications/, team/, status/, auth/, providers/
src/lib/          api.ts (typed client), queries.ts (TanStack Query hooks + keys), schemas.ts (Zod forms),
                  format.ts (formatters, role helpers), public-status.ts (server fetch), types.ts
```

- **API access**: the browser calls same-origin `/api/*`, proxied by a Next.js rewrite to `BACKEND_URL`, so the
  refresh cookie stays first-party (`SameSite=Strict`) and no browser CORS is involved.
- **Session**: the access token is kept **in memory only**; on load the app restores the session through the refresh
  cookie. A 401 triggers one shared ("single-flight") refresh, then the request is retried.
- **Rendering**: authenticated pages are client components rendered inside `<Suspense>` boundaries
  (`/w/[workspaceId]/layout.tsx` provides one for all workspace pages). The public status page is a server component
  that fetches the API per request and streams inside `<Suspense>`, with `generateMetadata` for the page title.
- **Data**: TanStack Query with central query keys; dashboards and monitor views refresh every 15 s.
- **Forms**: React Hook Form + Zod schemas mirroring the API's rules (the API stays authoritative).
- **Charts**: Recharts with a validated, colorblind-safe palette; state colors always come with an icon or label;
  charts offer a table view.
- **Permissions in the UI** (`can`, `canManageMember`, `assignableRoles`) only hide controls; the API enforces every rule.

## Key decisions

| Decision | Reason |
|---|---|
| PostgreSQL-only coordination (leases + `SKIP LOCKED`) | No Redis to run; safe across processes; survives restarts |
| Transactional outbox for notifications | No lost or phantom notifications; retries and delivery log come for free |
| Partial unique index for active incidents | Database-level guarantee of no duplicate incidents per outage |
| `timestamptz(3)` everywhere | Raw SQL compares with `now()`; plain `timestamp` breaks on non-UTC servers |
| DNS check inside the socket `lookup` | Prevents DNS-rebinding SSRF (validated address = connected address) |
| Opaque, hashed, rotating refresh tokens with reuse detection | OWASP-style session security |
| Zod on both sides | One validation vocabulary for API and forms |
| Same-origin API proxy | First-party cookies, no CORS in the browser |
