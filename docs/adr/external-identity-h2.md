# External Identity H2 — Verified Telegram Identity

Status: implemented; identity only, no persistence or session platform.

## Context

Telegram Mini Apps expose `window.Telegram.WebApp.initData` (raw query string including `hash`). `initDataUnsafe` is a parsed convenience object and is not authoritative. The product needs a stable internal `User` that is independent of any provider, with `ExternalIdentity` as the provider-based mapping, without coupling to `RoomProject` or the editor.

## Decision

- **New backend boundary:** `workers/app-api/` is the product backend for identity (future persistence). `workers/planning-intent` remains the provider-specific Groq adapter.

- **Host exposure:** `src/platform/telegram/host.ts` adds `initData?: string` and `getTelegramInitData(): string|null`. The raw string is the server-validation source; `initDataUnsafe` is never trusted. Not added to `TelegramSnapshot` / Device QA to avoid leaking via `COPY REPORT`.

- **Trust boundary:** only `workers/app-api` verifies initData via the official Telegram algorithm using Web Crypto:

  ```
  secret_key = HMAC-SHA256(key="WebAppData", data=bot_token)
  expected_hash = HMAC-SHA256(key=secret_key, data=data_check_string)
  ```
  `data_check_string` is built from decoded query values (URLSearchParams, duplicate-key rejection, `hash` excluded, sorted by key, `key=value` joined by `\n`). Verification uses constant-time hex compare.

- **Freshness:** `auth_date` integer seconds must be present. `now - auth_date <= TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` (required non-secret env, temporary development value `86400`) and `auth_date - now <= 30` future skew. `TELEGRAM_BOT_TOKEN` is a Worker secret (`wrangler secret put`), never committed.

- **D1 model `workers/app-api/migrations/0001_init.sql`:**
  ```sql
  users(id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)
  external_identities(provider TEXT NOT NULL, provider_subject TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY(provider, provider_subject), UNIQUE(user_id, provider), FOREIGN KEY(user_id) REFERENCES users(id))
  ```
  `provider='telegram'`, `user.id = crypto.randomUUID()`, `provider_subject = String(Telegram user id)` decimal. Same subject → same `user.id`; different subjects → different users. Concurrent first auth is proven by race test to create no orphan `users` row (transactional `DB.batch()` atomic rollback on PK failure, then `SELECT` of winner).

- **Endpoint:** `POST /auth/telegram` `{initData:"<raw>"}` → `200 {user:{id:"<uuid>"}, identity:{provider:"telegram"}}`. Bounded body 16 KiB (`readBoundedText` streaming guard + `Content-Length` early 413), strict `Content-Type: application/json`, strict method (`405` else), exact `ALLOWED_ORIGIN` CORS (`configuredOrigin` + `Vary: Origin`, `Cache-Control: no-store`), `OPTIONS` 204/403, controlled public errors (`invalid_request` 400/405/415, `origin_forbidden` 403, `server_misconfigured` 503, `invalid_init_data`/`init_data_expired` 401 with `{ok:false, error:{code}}`), no PII/initData/hash/token in logs or responses.

- **Reusable verifier:** `verifyTelegramInitData(initData, botToken, maxAge)` is exported from `workers/app-api/src/telegram.ts` for H3 protected routes to reuse the same checked logic.

- **Frontend:** `src/platform/identity/` outside `src/editor/state/store.ts` holds `anonymous | authenticating | authenticated | failed`. `bootstrapIdentity()` is fire-and-forget after `initTelegram()` in `src/main.tsx`; missing `VITE_APP_API_ENDPOINT` or missing `initData` → `anonymous` (feature disabled) with no request; `failed` does not block the local editor; raw `initData` is never persisted (memory-only `user.id` during H2), `localStorage`/`sessionStorage` never used.

- **Worker quality:** D1 via `env.DB` binding + `prepare().bind()` + `batch()`, generated `AppApiWorkerEnv` types (`wrangler types`), `compatibility_date 2026-08-25`, `workers_dev:false`, `preview_urls:false`, `observability.enabled:false` (auth material, privacy-safe telemetry not yet designed), request-local state, no floating promises.

## Consequences

- `User` is independent of Telegram; `ExternalIdentity` is `provider='telegram'` + decimal `provider_subject`.
- Browser without Telegram or without endpoint stays anonymous and fully usable.
- Verified Telegram bootstrap creates or recovers the same internal `User` idempotently; concurrent first auth leaves exactly one identity and zero orphan users.
- `VITE_APP_API_ENDPOINT` absence disables identity without code change; `ALLOWED_ORIGIN` for GitHub Pages is `https://llayon.github.io` (origin, not `/InteriorMagic` path) but committed template stays `https://example.invalid`.
- `freshness 86400` is temporary development policy, not architectural constant; `initData` is not a long-lived bearer for future APIs.

## Non-goals

No `Planning Contract`/`RoomProject`/planning engine/TV planner/`Preview/Apply`/editor history change; no sync `LocalProjectStorage` change; no project persistence / revision / conflict / schemaVersion; no bearer/refresh/cookie/session framework; H2 state is informational UI Bootstrap state only — server authorization never trusts client `authenticated`.

## H3 Deferred

Project repository + sync service, `schemaVersion` for data format, `revision` for optimistic concurrency, `fingerprint` for planner staleness, `409 stale_revision`, local-first commit + `dirty/unsynced`, cloud failure without rollback of editor Apply.

## References

- Telegram validating data: `https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app` (WebAppData key order, data_check_string, auth_date)
- Cloudflare Workers best practices, D1 Worker API, D1 migrations
