# PulseWatch — Project Handoff (permanent source of truth)

_Last updated: 2026-11-23 (session 1)._ Always verify claims below against the code and `git log`.

## 1. Purpose & requirements
PulseWatch is a portfolio-grade SaaS for monitoring websites/APIs, detecting downtime, managing
incidents and publishing public status pages, with workspaces, teams and RBAC.
Full original requirements: monitors, real monitoring engine, dashboard/analytics from real DB data,
incident lifecycle (OPEN → INVESTIGATING → IDENTIFIED → MONITORING → RESOLVED), email + webhook
notifications with retries and logs, public status pages, team invitations and roles
(OWNER/ADMIN/MEMBER/VIEWER), strict workspace isolation, security (SSRF, rate limiting, headers…),
tests, docs.

### Standing project policies (do not violate)
- **No Docker / containers / Kubernetes / CI/CD / GitHub Actions / IaC / deployment automation** — not even
  placeholder files or docs. The owner implements these personally.
- The app must run locally with manually installed Node.js + PostgreSQL.
- **Git identity:** the user (Ali Kassab, GitHub `ali-kassab`) must be the sole Author, Committer and only
  co-author. Never Claude/Anthropic/AI identity, never AI `Co-authored-by` trailers or AI attribution in
  commit messages. Verify author/committer before every commit and every push.
- Never push to `main`, never force-push, never merge PRs, never create/switch branches without authorization.
- Only access repositories owned by `ali-kassab`; never touch repositories of other accounts
  (e.g. `yahyamohmuedpro99`, `DeV-Global-LLC`, `Noureldin-Ahmed-FullStack`).
- Never commit secrets or `.env` files.
- Update handoff files throughout development.

## 2. Repository & Git
- Target remote: `https://github.com/ali-kassab/pulsewatch` (public) — **does not exist yet** (see blockers).
- Local repo: `/home/user/pulsewatch` (session container path), branch `main` (local only, no remote).
- Commits so far: see `SESSION_HANDOFF.md` (root) for the exact hashes.

## 3. Architecture (implemented)
Modular monolith. `backend/` NestJS 12 (ESM, TypeScript 6, Express adapter) + Prisma 7.10.1 (`prisma-client`
generator, `@prisma/adapter-pg`) + PostgreSQL 16. `frontend/` Next.js (App Router) — **not started**.
`docs/` documentation.

```
backend/
  prisma/schema.prisma, migrations/, seed.ts     prisma.config.ts (loads .env)
  src/
    main.ts, bootstrap.ts (helmet, cookies, CORS, /api prefix, global Zod validation), app.module.ts
    config/        Zod-validated env (env.ts) + typed AppConfig
    common/        prisma/, http/ (exception filter, {data,meta} envelope, request-id + access log, pagination),
                   security/ (AES-256-GCM, tokens), net/ (SSRF ip-policy, safe-http client), mail/ (nodemailer)
    auth/ users/ workspaces/ team/ monitors/ monitoring/ incidents/ notifications/ status-pages/ analytics/ health/
  test/            helpers/, e2e/*.e2e-spec.ts, integration/*.int-spec.ts
```

### Key technical decisions (with reasons)
| Decision | Reason |
|---|---|
| DB-backed scheduler: `monitors.next_check_at` + `locked_until` lease, claimed with `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` | No Redis requirement; no overlapping checks even across processes; survives restarts (state in DB, stale leases expire). |
| Notification **outbox** table (`notification_deliveries`) written in the same transaction as the state change; worker claims with SKIP LOCKED, exponential backoff 30s·2^(n-1) capped 1h, max 5 attempts | No lost/phantom notifications; retry + delivery log for free. |
| Partial unique index `incidents_one_active_per_monitor` (`WHERE status <> 'RESOLVED'`) | DB-level guarantee of no duplicate active incidents per outage. |
| All timestamps `timestamptz(3)` | Raw SQL compares with `now()`; plain `timestamp` breaks on non-UTC servers. |
| SSRF: static URL validation + DNS check inside the socket `lookup` (prevents DNS rebinding); redirects not followed; `ALLOW_PRIVATE_TARGETS=false` by default | Monitoring and webhooks fetch user-supplied URLs. |
| Refresh tokens: opaque, SHA-256 hashed, httpOnly SameSite=Strict cookie on `/api/auth`, rotated on each use, family revocation on reuse (10 s grace for concurrent tabs) | OWASP-style refresh rotation. Access JWT HS256, 15 min, in memory on the client. |
| Webhook config encrypted (AES-256-GCM, `ENCRYPTION_KEY`); URL masked, signing secret shown once; HMAC-SHA256 signature header `X-PulseWatch-Signature: t=…,v1=…` | Never expose webhook credentials. |
| Validation with Zod via Nest 12 `StandardSchemaValidationPipe` (`@Body({ schema })`) | Same schema library as the frontend. |
| `WorkspaceGuard` on every `/workspaces/:workspaceId/*` route: non-member → 404, insufficient role → 403 (`@MinRole`); services always filter by `workspaceId` | Isolation in depth; ids cannot be probed. |
| Check results kept 90 days (`CHECK_RETENTION_DAYS`), pruned hourly; analytics computed with SQL aggregates (`date_bin`, `percentile_cont`) | No rollup tables needed at portfolio scale. |
| `backend/.npmrc` has `legacy-peer-deps=true` | npm 10 arborist crashes (`edgesOut`) resolving vitest 4 optional peers. |

## 4. Database (see `backend/prisma/schema.prisma`)
users, refresh_tokens, workspaces, memberships (unique workspace+user), invitations (token hash),
monitors, check_results (bigint id; index monitor_id+checked_at desc), incidents, incident_updates,
notification_channels (encrypted config, subscribed events), notification_deliveries (outbox),
status_pages (1:1 workspace, unique slug).

## 5. API (prefix `/api`, success `{data, meta?}`, errors `{error:{statusCode,code,message,details?},requestId}`)
- Auth: `POST /auth/register|login|refresh|logout|logout-all`
- Users: `GET|PATCH /users/me`, `POST /users/me/password`
- Workspaces: `GET|POST /workspaces`, `GET|PATCH|DELETE /workspaces/:id`
- Team: `GET /workspaces/:id/members`, `PATCH|DELETE …/members/:memberId`, `POST …/leave`,
  `GET|POST …/invitations`, `DELETE …/invitations/:id`, public `GET /invitations/:token`, `POST /invitations/:token/accept`
- Monitors: `GET|POST …/monitors`, `GET|PATCH|DELETE …/monitors/:id`, `POST …/:id/pause|resume|check`, `GET …/:id/checks`
- Incidents: `GET|POST …/incidents`, `GET|PATCH …/incidents/:id`, `POST …/:id/updates`, `POST …/:id/resolve`
- Notifications (ADMIN): `GET|POST …/notifications/channels`, `GET|PATCH|DELETE …/channels/:id`, `POST …/channels/:id/test`, `GET …/notifications/deliveries`
- Status page: `GET|PATCH …/status-page`; public `GET /public/status-pages/:slug`
- Analytics: `GET …/analytics/summary|timeseries|monitors|activity` (`range=24h|7d|30d|90d`, `monitorId`)
- Health: `GET /health`, `GET /ready`; Swagger UI at `/api/docs` (non-production)

Permissions: VIEWER read-only (monitor header values masked); MEMBER manages monitors (not delete) and
incidents; ADMIN deletes monitors, manages notifications, status page and team (only lower roles, cannot
grant OWNER); OWNER everything incl. workspace deletion; at least one owner always kept.

## 6. Feature status
| Area | Status |
|---|---|
| Backend: auth, users, workspaces, RBAC, team/invitations | ✅ implemented & tested |
| Monitors + monitoring engine + scheduler | ✅ implemented & tested |
| Incidents (auto + manual lifecycle, timeline, notes) | ✅ implemented & tested |
| Notifications (email SMTP/log, webhooks, retries, logs, test send) | ✅ implemented & tested |
| Status pages, analytics, health | ✅ implemented & tested |
| Seed data | ✅ (`npm run db:seed`, demo@pulsewatch.dev / pulsewatch-demo) |
| Frontend (Next.js, Tailwind, shadcn/ui, Recharts, RHF+Zod) | ❌ not started |
| Docs: README, ARCHITECTURE, API_DOCUMENTATION, DATABASE_DESIGN, SECURITY, CHANGELOG | ❌ not written (README is a placeholder) |
| GitHub repository + push | ❌ blocked |

## 7. Testing status (actually executed 2026-11-23)
- Unit (`npm test`): 11 files, 77 tests passed.
- Integration + e2e (`npm run test:e2e`, real PostgreSQL `pulsewatch_test`): 7 files, 58 tests passed.
- `npm run build`, `npm run typecheck`, `npm run lint`: passed.
- Frontend tests: none yet.

## 8. Known issues / limitations
- Repository `ali-kassab/pulsewatch` cannot be created from the cloud session (proxy blocks `POST /user/repos`);
  must be created by the owner, then added to the Claude GitHub App's selected repositories.
- The cloud sandbox has no direct DNS/HTTP egress, so monitors for public URLs fail with DNS errors **only in
  the sandbox**; tests use local HTTP servers with `ALLOW_PRIVATE_TARGETS=true`.
- Redirects are not followed by checks (by design, SSRF); add 3xx codes to expected codes if needed.
- Monitor custom header values are stored in plaintext JSON (masked for viewers); channel configs are encrypted.
- Prisma blocks `migrate reset` for AI agents; use `psql` drop/create on throwaway dev DBs or run it yourself.

## 9. Next steps (in order)
1. Scaffold `frontend/` (Next.js App Router + TS + Tailwind + shadcn/ui + Recharts + RHF/Zod + TanStack Query),
   API proxy via Next rewrites `/api/* → http://localhost:4000/api/*` (keeps refresh cookie first-party).
2. Build pages: auth, onboarding, dashboard, monitors (list/new/detail/edit), incidents, notifications,
   status-page settings, team, account, public `/status/[slug]`, `/invite/[token]`.
3. Frontend tests (Vitest + Testing Library), production build, manual E2E run.
4. Write docs (README with local PostgreSQL setup without Docker, ARCHITECTURE, API_DOCUMENTATION,
   DATABASE_DESIGN, SECURITY, CHANGELOG).
5. Once the owner creates the repo and authorizes a branch: verify identity of every commit, push, verify remote hash.
