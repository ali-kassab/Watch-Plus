# Security

How PulseWatch protects accounts, workspaces and the networks it talks to. File references are under `backend/src/`
unless noted.

## Authentication and sessions

- **Passwords**: argon2id (`memoryCost` 19 MiB, `timeCost` 2, `parallelism` 1 — OWASP minimum), 8–128 characters.
  Login verifies against a dummy hash when the e-mail is unknown, so response time does not reveal registered
  addresses; the error message is the same for both cases (`auth/auth.service.ts`).
- **Access tokens**: JWT HS256 signed with `JWT_ACCESS_SECRET` (≥ 32 chars, validated at startup), 15-minute
  lifetime. The frontend keeps it **in memory only** — never in `localStorage` or cookies.
- **Refresh tokens**: 384-bit random opaque values; only their SHA-256 hash is stored. Sent as an `httpOnly`,
  `SameSite=Strict`, `Secure` (in production) cookie limited to `/api/auth`. Rotated on every use; presenting an
  already-rotated token revokes the whole session family (a 10-second grace window tolerates concurrent tabs).
  Logout revokes the family; "sign out everywhere" revokes all of the user's sessions.
- **Rate limits**: 300 requests/min per client by default; register and login 10/min, refresh 30/min, "check now"
  10/min, public status page 120/min (`@nestjs/throttler`).

## Authorization and workspace isolation

- Every route requires a valid access token unless explicitly marked `@Public()` (global JWT guard).
- `WorkspaceGuard` protects every `/workspaces/:workspaceId/*` route: it loads the caller's membership on **each
  request** (removed members lose access immediately), answers **404** to non-members so workspace ids cannot be
  probed, and **403** when `@MinRole` is not met.
- Services always filter by `workspaceId` in addition to the guard (defense in depth); an id from another workspace
  is simply "not found".
- Team rules (`team/team.policy.ts`): owners manage everyone; others only members ranked strictly below them; nobody
  can grant a role above their own; the last owner can neither leave, be removed nor be demoted.
- Viewers see monitor header values masked (they may contain API keys).
- Invitations: 256-bit tokens stored as SHA-256 hashes, valid 7 days, single use, revocable, and only accepted by a
  signed-in user whose e-mail matches the invitation.
- The frontend hides controls by role for usability only; the API enforces every rule.

## Outbound requests (SSRF protection)

Monitors and webhooks make the server fetch user-supplied URLs, so they go through one hardened client
(`common/net/safe-http.ts`, `common/net/ip-policy.ts`):

- Only `http`/`https`; no credentials in the URL; host names such as `localhost`, `*.local`, `*.internal`, `*.lan`,
  `*.home.arpa` and single-label names are rejected.
- **The DNS answer is checked inside the socket's `lookup`**, so the address that was validated is the address that
  is connected to — this defeats DNS rebinding. Only globally routable unicast addresses are allowed: loopback,
  RFC 1918, link-local (including cloud metadata `169.254.169.254`), CGNAT, unique-local IPv6, multicast and reserved
  ranges are refused, and IPv4-mapped IPv6 addresses are unwrapped first.
- Redirects are **not followed**; timeouts are enforced; response bodies are capped (16 kB for checks, 2 kB for
  webhooks); custom headers cannot set `Host`, `Content-Length`, `Connection`, `Transfer-Encoding`, `Proxy-*` and
  similar, and may not contain line breaks.
- `ALLOW_PRIVATE_TARGETS=true` disables the address checks for local development and tests only. **Never enable it
  in production.**

## Secrets and sensitive data

- Notification channel settings (e-mail recipients, webhook URL and signing secret) are encrypted at rest with
  AES-256-GCM (random 96-bit IV, authenticated) using `ENCRYPTION_KEY` (32 bytes, validated at startup).
- API responses never include secrets: webhook URLs are masked, and the signing secret is shown only once, when it is
  created or rotated. Delivery payloads stored in the outbox contain no secrets.
- Webhooks are signed: `X-PulseWatch-Signature: t=<timestamp>,v1=<HMAC-SHA256("<t>.<body>")>`; receivers should
  verify it in constant time and reject old timestamps (see `notifications/webhook-signature.ts`).
- `.env` files are git-ignored; `.env.example` files contain no real secrets.

## HTTP hardening

- API: `helmet` default headers, `x-powered-by` disabled, JSON bodies limited to 100 kB, strict Zod validation of
  every body, query and route parameter, CORS limited to `FRONTEND_URL` with credentials, uniform error format
  without stack traces, and a request id on every response for tracing. The access log records method, path, status,
duration and user id — never bodies, query strings or tokens (invitation tokens in paths are redacted).
- Frontend (`frontend/next.config.ts`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and no `X-Powered-By`.
  The browser talks only to its own origin (`/api` is proxied), so cookies stay first-party.
- Post-login redirects accept only same-site relative paths (`frontend/src/lib/schemas.ts`, `safeNextPath`), preventing
  open redirects.
- User-provided text (incident updates, names, status page content) is rendered as text by React, never as HTML.
- The public status page exposes only what is meant to be public: published pages, monitors marked "show on status
  page" (by name, without URLs), public incidents and their non-internal updates.

## Data retention

Check results are pruned after `CHECK_RETENTION_DAYS` (default 90). Deleting a workspace deletes all of its data;
deleting a monitor deletes its check history.

## Known limitations

- Monitor custom header values are stored as plain JSON in the database (masked for viewers, not encrypted at rest).
  Use dedicated, least-privilege tokens for monitoring.
- A removed member keeps a valid access token for up to 15 minutes, but it no longer grants access to that
  workspace, because membership is checked on every request.
- Rate limits are kept in memory per API process.

## Reporting

Please report vulnerabilities privately to the repository owner rather than in a public issue.
