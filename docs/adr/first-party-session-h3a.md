# First-Party Session H3A — Telegram Bootstrap to Opaque Cookie Session

Status: implemented; Telegram bootstrap-only, protected APIs use first-party session.

## Decision

Production cookie authentication **MUST be same-site minimum**, **same-origin preferred**.

- Preferred (same-origin): `https://interiormagic.example/` + `https://interiormagic.example/api/*` (single origin, no CORS credentials, cookie automatically same-origin).
- Acceptable (same-site, cross-origin): `https://app.interiormagic.example` + `https://api.interiormagic.example` (same registrable site `interiormagic.example`, requires `Access-Control-Allow-Origin: <exact>` + `Allow-Credentials:true` + `credentials:include` + `SameSite=Lax`).
- Development/demo only: `llayon.github.io` (Pages `https://llayon.github.io`) + `workers.dev` (`*.workers.dev`). `workers/app-api/wrangler.jsonc:7-8` stays `workers_dev:false`/`preview_urls:false`; `ALLOWED_ORIGIN` template stays `https://example.invalid`.

This ADR records the boundary only. Do NOT perform hosting migration, DNS, custom domain, or deploy in H3A.

Same-origin is preferred but same-site is the **minimum** production requirement. `Domain` is never set; `Path=/`.

## 1. Telegram initData is bootstrap-only

`POST /auth/telegram` verifies raw `initData` once via `workers/app-api/src/telegram.ts:verifyTelegramInitData` (Web Crypto `WebAppData`→`secret_key`→`data_check_string`, constant-time, decoded `URLSearchParams` duplicate rejection, `auth_date` freshness `86400`/`30s`). On success it resolves `User` via `external_identities` and creates a first-party session. Raw `initData` is not used on `GET /session`, `POST /logout`, or future protected routes.

## 2. Protected APIs use opaque first-party sessions

Future H3B project APIs consume `requireSession(request,env)` (cookie → `SHA-256(raw)` → `sessions` → `userId`). No repeated `initData`.

## 3. Raw session token is 256-bit+ capability held only in HttpOnly cookie

Generated from ≥256-bit CSPRNG (`crypto.getRandomValues` 32B → base64url, no padding), unpredictable, transport-safe. `crypto.randomUUID()` is not sufficient entropy alone; use 32B random.

## 4. D1 stores only SHA-256(token) hash

`workers/app-api/migrations/0002_sessions.sql` `sessions(id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER, expires_at INTEGER, FK users(id))` with `idx_sessions_user`/`idx_sessions_expires`. No raw token, no salt needed (high entropy). `createSession(userId,now,ttl)` returns `{rawToken, hash}`; `getSessionByTokenHash` checks `expires_at > now`; `deleteSessionByTokenHash` immediate.

## 5. Absolute expiry, no refresh-token framework

`SESSION_TTL_SECONDS` env policy (non-secret `vars`, default `2592000` ~30d, strict positive integer ≤31536000, invalid/missing → `503 server_misconfigured`). `expires_at = created_at + ttl*1000`. No rolling renewal, no refresh token, no cron/scheduled cleanup (lazy `DELETE` on `401` optional, no periodic job).

## 6. Cookie production contract

Preferred production `__Host-im_session=<token>; Path=/; HttpOnly; Secure; SameSite=Lax` — `Secure` + `__Host-` implies `Path=/` + no `Domain` (checked via `Secure` flag + no `Domain` attribute). `SameSite=Lax` + exact `Origin` validation + bounded + strict `Content-Type` for CSRF defense.

Local HTTP development (e.g. `http://localhost:4173` when `ALLOWED_ORIGIN` is `http://…`) uses separate `im_session=<token>; Path=/; HttpOnly; SameSite=Lax` (no `Secure`, no `Domain`, no `__Host-`). Policy is pure `sessionCookiePolicy(env)` → `{name, secure, sameSite, path}` derived from `ALLOWED_ORIGIN` scheme, no client runtime config. Production **never** accepts `im_session`; local dev **only** accepts `im_session`.

## 7. Same-site production topology required, same-origin preferred

As above; `llayon.github.io` + `workers.dev` remains demo-only cross-site (no shared cookie). ADR does not configure DNS.

## 8. Exact Origin + SameSite boundary for CSRF

Mutating `POST /auth/telegram`, `POST /logout` → `Origin` MUST be present and `=== allowedOrigin` (`missing`/`wrong` → `403 origin_forbidden`, no wildcard, no suffix/regex, no substring), with `Access-Control-Allow-Origin: <exact>` + `Allow-Credentials:true` + `Vary: Origin` when allowed, and the `SameSite=Lax` cookie as second defense layer.

`GET /session` (safe read) contract:

```
Origin present
  → Origin MUST === ALLOWED_ORIGIN
Origin absent (same-origin topology, preferred production)
  → request URL origin MUST === ALLOWED_ORIGIN
otherwise
  → 403 origin_forbidden
```

When `Origin` is present and exact, responses carry `Access-Control-Allow-Origin: <exact>` + `Access-Control-Allow-Credentials:true`; same-origin requests without `Origin` need no CORS headers. Cross-origin readers never receive authenticated bodies. All auth/session responses are `Cache-Control: no-store`.

`POST /auth/telegram` requires strict JSON body: media type (before any `; parameters`) must equal exactly `application/json` (e.g. `application/json; charset=utf-8` is valid, `application/jsonxxx` is rejected `415`).

## 9. Frontend authenticated state is not authorization

`src/platform/identity/` holds `anonymous|authenticating|authenticated|failed` outside `src/editor/state/store.ts` (editor `RoomProject` never holds auth). `authenticated` is informational UI bootstrap state only; server `requireSession()/D1` is authority. Client never sees raw token (`httpOnly`), never stores in `localStorage`/`sessionStorage`/`Zustand`/`RoomProject`/`diagnostics`.

## 10. Anonymous local editor remains supported

`VITE_APP_API_ENDPOINT` absence → `anonymous` feature gate (no `GET /session`/`POST`); `outside-Telegram` without `initData` → `anonymous`; any `failed`/`401` leaves editor fully usable, no startup block.

## 11. H3B project repository deferred

No `projects` table, no `GET/POST /projects`, no `RoomProject` persistence, no `expectedRevision`/`stale_revision`, no sync queue, no My Projects UI, no Contract v2, no planning/AI changes. H3B will own project persistence after H3A merge.

## 12. No RoomProject/planner/Contract changes

`RoomProject` `version:1`, `PlanningScene` disposable, `Contract v1` frozen, `LocalProjectStorage` semantics unchanged; `G2C`/`AR0` unaffected.

## References

- Telegram initData validation `core.telegram.org/bots/webapps`, Web Crypto
- Cloudflare Workers best practices, D1 Worker API, D1 migrations
- Previous ADRs: `telegram-fullscreen-h1.md`, `external-identity-h2.md` (forward-reference only)
