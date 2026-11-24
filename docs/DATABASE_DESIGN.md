# Database design

PostgreSQL 16, managed with Prisma 7 (`backend/prisma/schema.prisma`, migrations in `backend/prisma/migrations`).
Table and column names are `snake_case`; ids are UUIDs except `check_results.id` (`bigserial`, high volume). Every
timestamp is `timestamptz(3)` because raw SQL compares with `now()` and a plain `timestamp` breaks on servers that
are not in UTC.

## Entity overview

```
users ─┬─< refresh_tokens
       ├─< memberships >── workspaces ─┬─< invitations (invited_by → users)
       │                               ├─< monitors ──< check_results
       │                               │      └──────< incidents ──< incident_updates (author → users)
       │                               ├─< incidents (created_by → users, monitor optional)
       │                               ├─< notification_channels ──< notification_deliveries
       │                               ├─< notification_deliveries
       │                               └── status_pages (1:1)
```

Deleting a workspace cascades to all of its data. Deleting a monitor cascades to its check results and sets
`incidents.monitor_id` to `NULL` (incident history is kept). Deleting a user removes their memberships, sessions and
sent invitations; incidents and updates they wrote keep their content with the author set to `NULL`.

## Tables

| Table | Purpose and notable columns |
|---|---|
| `users` | `email` (unique, lower-cased by the API), `name`, `password_hash` (argon2id) |
| `refresh_tokens` | `token_hash` (SHA-256 of the opaque token, unique), `family_id` (one login session), `expires_at`, `revoked_at`, `replaced_by` (rotation chain), `user_agent` |
| `workspaces` | `name`, `slug` (unique) |
| `memberships` | `workspace_id` + `user_id` (unique pair), `role` (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`) |
| `invitations` | `email`, `role`, `token_hash` (unique), `invited_by_id`, `expires_at` (7 days), `accepted_at`, `revoked_at` |
| `monitors` | Configuration: `url`, `method`, `interval_seconds`, `timeout_ms`, `expected_status_codes int[]`, `headers jsonb`, `body`, `retries`, `is_active`, `show_on_status_page`. Live state: `health` (`PENDING`/`UP`/`DOWN`), `last_checked_at`, `last_status_code`, `last_response_time_ms`, `last_error`, `health_changed_at`. Scheduling: `next_check_at`, `locked_until` (lease) |
| `check_results` | One row per check: `checked_at`, `success`, `status_code`, `response_time_ms`, `error_type` (`TIMEOUT`, `DNS`, `CONNECTION`, `TLS`, `STATUS_MISMATCH`, `BLOCKED_TARGET`, `UNKNOWN`), `error`, `attempts`. Kept `CHECK_RETENTION_DAYS` (90) days |
| `incidents` | `title`, `status` (`OPEN` → `INVESTIGATING` → `IDENTIFIED` → `MONITORING` → `RESOLVED`), `severity` (`MINOR`/`MAJOR`/`CRITICAL`), `is_automatic`, `is_public`, `resolution`, `started_at`, `resolved_at`, `monitor_id?`, `created_by_id?` |
| `incident_updates` | Timeline: `type` (`CREATED`, `STATUS_CHANGE`, `UPDATE`, `NOTE`, `RESOLVED`), `status?`, `message`, `is_internal`, `author_id?` (NULL = system) |
| `notification_channels` | `type` (`EMAIL`/`WEBHOOK`), `name`, `events` (enum array), `is_enabled`, `config_encrypted` (AES-256-GCM JSON: recipients, or webhook URL + signing secret) |
| `notification_deliveries` | Outbox / delivery log: `event`, `payload jsonb` (no secrets), `status` (`PENDING`, `SENDING`, `SUCCESS`, `FAILED`), `attempts`, `max_attempts` (5; 1 for tests), `next_attempt_at`, `locked_until`, `last_error`, `response_status`, `delivered_at` |
| `status_pages` | One per workspace (`workspace_id` unique): `slug` (unique), `title`, `description`, `is_published` |

## Indexes and constraints

| Index | Serves |
|---|---|
| `monitors (is_active, next_check_at)` | Scheduler: find due monitors |
| `check_results (monitor_id, checked_at DESC)` | Check history pages, per-monitor analytics, latest checks |
| `check_results (checked_at)` | Retention pruning, workspace-wide time ranges |
| `incidents (workspace_id, status)`, `incidents (workspace_id, started_at DESC)`, `incidents (monitor_id)` | Incident lists and filters, active incident lookup |
| **`incidents_one_active_per_monitor`** — unique on `monitor_id` `WHERE status <> 'RESOLVED' AND monitor_id IS NOT NULL` (raw SQL in the migration) | Guarantees at most one active incident per monitor even under concurrent checks; a violation becomes a 409 for manual creation |
| `incident_updates (incident_id, created_at)` | Timelines |
| `notification_deliveries (status, next_attempt_at)` | Worker: find due deliveries |
| `notification_deliveries (workspace_id, created_at DESC)` | Delivery log |
| `memberships (workspace_id, user_id)` unique, `memberships (user_id)` | Membership checks on every workspace request; "my workspaces" |
| `refresh_tokens (token_hash)` unique, `(family_id)`, `(user_id)` | Token lookup, family revocation, logout everywhere |
| `invitations (token_hash)` unique, `(workspace_id)` | Accepting and listing invitations |

## Concurrency patterns

- **Monitor leases**: `UPDATE monitors SET locked_until = now() + <timeout × (retries + 1) + padding> WHERE id IN
  (SELECT id … WHERE is_active AND next_check_at <= now() AND (locked_until IS NULL OR locked_until < now()) ORDER BY
  next_check_at LIMIT n FOR UPDATE SKIP LOCKED)`. Competing workers skip each other's rows; an expired lease is
  reclaimed automatically.
- **Delivery claims** use the same `FOR UPDATE SKIP LOCKED` pattern on `notification_deliveries`.
- **State changes are transactional**: a check result, the monitor's new state, the incident change and the
  notification outbox rows are written in one transaction.

## Analytics queries

Uptime is `successful checks / total checks` per bucket. Buckets come from `date_bin(<step>, checked_at, origin
2000-01-01 UTC)` — 1 hour (24 h range), 6 hours (7 d), 1 day (30 d, 90 d) — and p95 latency from
`percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms) FILTER (WHERE success)` — response times are
averaged over successful checks only, so timeouts do not distort latency. Buckets without checks are returned as `null`
(no data), never as 0 %.

## Migrations and seed

- Apply: `npx prisma migrate deploy`. Create a new migration in development: `npm run db:migrate`.
- Seed: `npm run db:seed` (`prisma/seed.ts`) — demo user, workspace, monitors with generated check history,
  incidents and a published status page (`demo-inc`).
- Prisma blocks `migrate reset` when run by AI agents; reset development databases manually.
