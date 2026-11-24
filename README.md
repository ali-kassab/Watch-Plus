# PulseWatch

Monitor websites and APIs, detect downtime, manage incidents and publish public status pages — with workspaces,
teams and role-based access control.

- **Monitoring engine** — HTTP(S) checks on a schedule (10 s – 24 h), custom method/headers/body, expected status
  codes, timeouts and retries. Outages open incidents automatically, and recovery resolves those automatic incidents.
- **Incidents** — lifecycle `OPEN → INVESTIGATING → IDENTIFIED → MONITORING → RESOLVED`, a timeline with public
  updates and internal notes, severity and status-page visibility.
- **Notifications** — e-mail (SMTP) and signed webhooks with automatic retries and a delivery log.
- **Status pages** — a public page per workspace with overall status, 90-day uptime history and incidents.
- **Analytics** — uptime, average / p95 response time and failures over 24 h, 7 d, 30 d and 90 d, from real check data.
- **Teams** — invitations and the roles Owner, Admin, Member and Viewer, with strict workspace isolation.

| Part | Stack |
|---|---|
| `backend/` | NestJS 12 (TypeScript, ESM), Prisma 7 + PostgreSQL 16, Zod, argon2, nodemailer |
| `frontend/` | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query, React Hook Form + Zod, Recharts |

Documentation: [Architecture](docs/ARCHITECTURE.md) · [API](docs/API_DOCUMENTATION.md) ·
[Database design](docs/DATABASE_DESIGN.md) · [Security](docs/SECURITY.md) · [Changelog](docs/handoff/CHANGELOG.md)

## Run locally

Requirements: **Node.js 22** (npm 10) and **PostgreSQL 16**, both installed directly on your machine.

### 1. Database

Create a database user and two databases (the second is used by the integration / e2e tests):

```bash
sudo -u postgres psql -c "CREATE ROLE pulsewatch LOGIN PASSWORD 'pulsewatch' CREATEDB;"
```

```bash
sudo -u postgres psql -c "CREATE DATABASE pulsewatch OWNER pulsewatch;" -c "CREATE DATABASE pulsewatch_test OWNER pulsewatch;"
```

On macOS (Homebrew) or Windows, run the same SQL statements with `psql` as a superuser.

### 2. Backend (API on http://localhost:4000)

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set the two secrets (each command prints a value):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_ACCESS_SECRET
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # ENCRYPTION_KEY
```

`.env` must exist before installing, because `npm ci` runs `prisma generate`. Then:

```bash
npm ci
```

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run start:dev
```

The seed creates the demo account **demo@pulsewatch.dev / pulsewatch-demo** with a workspace, monitors, incidents and
the published status page `/status/demo-inc`. Interactive API docs (Swagger) are served at
http://localhost:4000/api/docs outside production.

E-mail is written to the server log by default (`MAIL_TRANSPORT=log`). Set `MAIL_TRANSPORT=smtp` and the `SMTP_*`
variables to send real e-mail.

### 3. Frontend (http://localhost:3000)

```bash
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

The browser only talks to the frontend origin: `/api/*` is proxied to `BACKEND_URL` (default
`http://localhost:4000`), so no CORS setup is needed.

For a production build: `npm run build && npm start` in `frontend/`, and `npm run build && npm run start:prod` in
`backend/` with `NODE_ENV=production`.

## Tests and checks

| Where | Command | What |
|---|---|---|
| `backend/` | `npm test` | Unit tests (Vitest) |
| `backend/` | `npm run test:e2e` | Integration + e2e tests against the real `pulsewatch_test` database |
| `backend/` | `npm run typecheck`, `npm run lint`, `npm run build` | Types, oxlint, compile |
| `frontend/` | `npm test` | Unit and component tests (Vitest + Testing Library, jsdom) |
| `frontend/` | `npm run lint`, `npm run build` | ESLint, production build (includes type checking) |

The e2e tests read `TEST_DATABASE_URL` (default
`postgresql://pulsewatch:pulsewatch@localhost:5432/pulsewatch_test`) and apply migrations themselves.

## Configuration (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — (required) | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | — (required, ≥ 32 chars) | Signs access tokens |
| `ENCRYPTION_KEY` | — (required, 32 bytes base64) | Encrypts notification channel settings |
| `FRONTEND_URL` | `http://localhost:3000` | CORS origin and links in e-mails |
| `PORT` | `4000` | API port |
| `JWT_ACCESS_TTL_SECONDS` / `REFRESH_TOKEN_TTL_DAYS` | `900` / `30` | Session lifetimes |
| `SCHEDULER_ENABLED`, `SCHEDULER_TICK_MS`, `SCHEDULER_MAX_CONCURRENCY` | `true`, `2000`, `20` | Monitoring engine |
| `CHECK_RETENTION_DAYS` | `90` | Check history kept |
| `ALLOW_PRIVATE_TARGETS` | `false` | Allow monitoring/webhooks to private networks. **Never enable in production.** |
| `MAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | `log`, … | E-mail |
| `THROTTLE_LIMIT` | `300` | Requests per minute per client (stricter limits apply to auth) |

The configuration is validated at startup; the API refuses to start with a clear message when a value is invalid.

## Notes

- Monitored URLs and webhooks must resolve to public internet addresses (SSRF protection); redirects are not followed,
  so add `301`/`302` to the expected status codes if an endpoint redirects.
- Prisma does not allow AI agents to run `prisma migrate reset`; reset a development database yourself if needed.
