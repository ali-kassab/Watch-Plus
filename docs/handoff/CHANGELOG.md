# PulseWatch — Changelog

Development log per milestone (newest first). Hashes: see `git log`.

## Unreleased (branch `claude/peaceful-mayer-6hod8f`)
### Added
- Frontend incidents: list (state tabs, severity filter, pagination), declare-incident dialog, detail page with
  timeline, public updates with status change, internal notes, severity / status-page visibility editing, resolve dialog.
- Frontend notifications (channels CRUD, test send, one-time signing secret, rotate, delivery log), status-page
  settings, team (roles, removal, leave, invitations) and workspace settings (rename, delete) pages.
- Public status page `/status/[slug]`: server-rendered (Suspense + `generateMetadata`), overall status banner, active
  and recent resolved incidents, per-service 90-day uptime strip (30 days on phones) with legend and per-day tooltips,
  distinct "not found" and "temporarily unavailable" views.
- Frontend test suite: `npm test` (Vitest 5 + Testing Library, jsdom) — format/policy helpers, form schemas and
  payload builders, API client (token, single-flight refresh, errors), incident update form, channel dialog,
  incident timeline, uptime strip.
- Documentation: README (local setup with PostgreSQL, no Docker; tests; configuration), `docs/ARCHITECTURE.md`,
  `docs/API_DOCUMENTATION.md`, `docs/DATABASE_DESIGN.md`, `docs/SECURITY.md`.

## Earlier (merged into `main` via PR #1, `feature/pulsewatch-frontend`)
- Backend: NestJS API — auth, workspaces, RBAC, team/invitations, monitors + DB-backed scheduler, incidents,
  notifications outbox (email/webhook), status pages, analytics, health; unit + e2e tests; seed data.
- Frontend foundation: Next.js 16 app, auth pages, onboarding, account, dashboard, monitors list/new/detail/edit.
