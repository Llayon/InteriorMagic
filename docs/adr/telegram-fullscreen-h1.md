# Telegram Fullscreen H1

Status: implemented; best-effort fullscreen, expand remains fallback.

## Context

Telegram Mini Apps distinguish `expand()` (half-height → viewport-stable full-height) from Bot API 8.0 fullscreen (`requestFullscreen` / `isFullscreen` / `fullscreenChanged` / `fullscreenFailed`). The app previously used only `ready()` + `expand()` and `viewportStableHeight` + `safeAreaInset`/`contentSafeAreaInset` (6.4+/8.0). Fullscreen must be available when the host supports it without breaking expanded mode, older clients, or the ordinary browser.

Official behavior: https://core.telegram.org/bots/webapps — `isFullscreen`, `requestFullscreen`, `fullscreenChanged`, `fullscreenFailed {error: 'UNSUPPORTED' | ...}` are Bot API 8.0; version gating via `isVersionAtLeast('8.0')`.

## Decision

- Extend the typed host boundary only: `isExpanded`, `viewportHeight`, `isFullscreen`, `isVersionAtLeast`, `requestFullscreen`, `exitFullscreen`, `fullscreenChanged`/`fullscreenFailed` events. No general SDK wrapper.
- Preserve `ready()` and `expand()` order. Avoid duplicate `expand()` when `isExpanded === true`.
- Fullscreen is **distinct from expanded** and **best-effort**:
  - Request at most once per `TelegramWebAppHost` instance (`WeakSet` guard, not a plain global boolean — scopes the request to the host object so a re-bootstrap of the same SPA shell or a test host swap does not trigger a second request for the same instance; a new host object may request again).
  - Gate on `insideTelegram && isVersionAtLeast('8.0') && requestFullscreen && !isFullscreen && !alreadyRequestedForThisHost`.
  - On older/unsupported hosts remain expand-only.
- `fullscreenFailed` (e.g. `UNSUPPORTED`) is non-fatal: keep expanded fallback, do not retry, do not fail bootstrap, do not show UI.
- Do not lock orientation, do not disable vertical swipes, do not add a fullscreen button.
- Widen `onEvent`/`offEvent` listener to `(payload?: unknown) => void` to carry `fullscreenFailed` payload without introducing an error domain; handlers refresh viewport only.
- Viewport authority stays `viewportStableHeight` → `--tg-viewport-stable-height` (`100dvh` fallback). `viewportHeight` is diagnostic only. Safe area stays `contentSafeAreaInset ?? safeAreaInset` → `--tg-safe-*` merged via `max(env(safe-area-inset-*), var(--tg-safe-*))`.
- Refresh CSS variables after `viewportChanged`, `safeAreaChanged`, `contentSafeAreaChanged`, `fullscreenChanged`, and `fullscreenFailed` (via `applyViewport`). No duplicate listeners: each `initTelegram()` cleans the previous subscription before adding a new one; `fullscreenRequestedHosts` is not cleared by cleanup.

## Snapshot / QA

`TelegramSnapshot` and `Device QA` (`deviceQa.ts` / `deviceReport.ts`) expose `isExpanded`, `viewportHeight`, `isFullscreen` alongside existing `isActive`/`viewportStableHeight`/insets. No editor/planner dependency.

## Consequences

- Supported Telegram 8.0+ client: exactly one `requestFullscreen()` per bootstrap/host; fallback expanded if unsupported/failed.
- Old Telegram / browser / `platform: 'unknown'`: safe no-op, expand-only or no host at all, never crashes.
- Repeated `initTelegram()` does not accumulate listeners; `fullscreenChanged` and safe-area events keep geometry consistent.
- Browser layout (`useWorkspaceGeometry` probe, `fitRoom`) unchanged; `viewportStableHeight` remains layout authority.

## Non-goals

No Contract/RoomProject/planning/preview/apply/history/collision/`planning-intent` Worker changes; no auth/persistence/backend; no orientation lock, swipe lock, or fullscreen UI; no bearer token/session framework (H2).

## Tests

- Unit `host.test.ts`: unknown vs Telegram, fullscreen diagnostics, payload-aware listener.
- Unit `telegram.test.ts`: browser/unknown no-op, pre-8.0 expand-only, supported once, already fullscreen no-op, avoid duplicate expand, fullscreenFailed non-fatal + no retry, fullscreenChanged/safe-area refresh, content-preference, idempotent listeners, per-host WeakSet, viewportChanged refresh, exception swallow.
- E2E `h1-telegram-fullscreen.spec.ts`: isolated `page.addInitScript` Telegram mock — supported once, pre-8.0 expand-only, already fullscreen, fullscreenFailed keeps usable, fullscreenChanged refreshes CSS + geometry, browser fallback.

## References

- Telegram WebApp docs — fullscreen API (Bot API 8.0): isFullscreen, requestFullscreen, fullscreenChanged, fullscreenFailed, isVersionAtLeast.
