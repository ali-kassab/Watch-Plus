# PulseWatch — Session Handoff

_Session 4 · 2026-11-24 · in progress._ Read `docs/handoff/PROJECT_HANDOFF.md` first (permanent decisions & policies).

## Project overview
PulseWatch: API/website monitoring & incident-management SaaS (portfolio project). `backend/` NestJS 12 + Prisma 7 +
PostgreSQL (complete). `frontend/` Next.js 16 App Router (remaining pages in progress).

## Git
- Repo `https://github.com/ali-kassab/Watch-Plus`. PR #1 (`feature/pulsewatch-frontend`) was **merged into `main`** by
  the owner. This session works on the session-authorized branch **`claude/peaceful-mayer-6hod8f`** (created from
  `main` @ `f778a84`). Never push to `main`.
- Identity: repo-local `git config user.name "Ali Kassab"`, `user.email 110043853+ali-kassab@users.noreply.github.com`
  (a fresh container has Claude's global identity — always set the local one first). No AI trailers in commits.

## Current task / checkpoint
Frontend milestone 2 — remaining pages. Done: **incidents** (list + detail). Next: notifications → status-page settings
→ team → workspace settings → public `/status/[slug]`; then frontend tests, browser E2E, docs.

## Completed this session
- Incidents: `frontend/src/app/w/[workspaceId]/incidents/page.tsx`, `…/incidents/[incidentId]/page.tsx`,
  `frontend/src/components/incidents/{create-incident-dialog.tsx,incident-timeline.tsx,incident-update-form.tsx,use-incident-actions.ts}`,
  `frontend/src/lib/schemas.ts` (+ `incidentUpdateFormSchema`, `resolveIncidentSchema`).
- Verification: `npx tsc --noEmit` ✅, `npm run lint` ✅, `npm run build` ✅, Playwright smoke (login → list → create →
  status update → internal note → severity → resolve) ✅ against the real backend + seeded DB. Backend unit 77 ✅, e2e 58 ✅.

## Environment notes (fresh container)
- `sudo service postgresql start`; create role/DBs `pulsewatch` and `pulsewatch_test` (user/pass `pulsewatch`, CREATEDB).
- `backend/.env` must exist before `npm ci` (postinstall `prisma generate` reads it): copy `.env.example`, fill
  `JWT_ACCESS_SECRET` and `ENCRYPTION_KEY`. Then `npx prisma migrate deploy && npm run db:seed`.
- Frontend `tsc` needs Next's generated route types (`LayoutProps`): run `npx next typegen` (or a build) first.
- Run: backend `npm run build && node dist/main.js` (:4000); frontend `npm run build && npx next start` (:3000).

## Known issues
- Sidebar links to not-yet-built pages (notifications, status-page, team, settings) 404 on prefetch until built.
- Arabic RTL / English LTR is mentioned by the owner but is not a documented requirement — not implemented; new
  components use logical CSS properties (`ps-`, `start-`) where cheap.

## Exact next step
Build `/w/[id]/notifications` (channels CRUD, test send, signing secret shown once, delivery log; ADMIN only).
