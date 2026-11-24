# PulseWatch — Changelog

Development log per milestone (newest first). Hashes: see `git log`.

## Unreleased (branch `claude/peaceful-mayer-6hod8f`)
### Added
- Frontend incidents: list (state tabs, severity filter, pagination), declare-incident dialog, detail page with
  timeline, public updates with status change, internal notes, severity / status-page visibility editing, resolve dialog.

## Earlier (merged into `main` via PR #1, `feature/pulsewatch-frontend`)
- Backend: NestJS API — auth, workspaces, RBAC, team/invitations, monitors + DB-backed scheduler, incidents,
  notifications outbox (email/webhook), status pages, analytics, health; unit + e2e tests; seed data.
- Frontend foundation: Next.js 16 app, auth pages, onboarding, account, dashboard, monitors list/new/detail/edit.
