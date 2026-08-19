# Browser testing

Playwright Chromium is the browser QA layer between domain tests and physical Telegram WebView checks.

## Setup and commands

```bash
npm ci
npm run playwright:install
npm run typecheck:e2e
npm run test:e2e
```

Interactive variants are `npm run test:e2e:headed` and `npm run test:e2e:ui`. Playwright starts Vite automatically on `127.0.0.1:4173` in the dedicated `test` mode.

The project matrix is deliberately bounded:

- `mobile-short`: 360×700, touch and responsive scenarios;
- `mobile-small`: 390×844, complete core, mouse, touch and responsive suite;
- `mobile-large`: 430×932, responsive scenario;
- `desktop`: 1440×900, core mouse and responsive suite.

Failure screenshots, videos, traces, and context are written to `test-results/`; the HTML report is written to `playwright-report/`. Open a trace with `npx playwright show-trace path/to/trace.zip`. GitHub Actions uploads both directories when E2E fails.

## Mouse and touch input

Mouse tests remain the stable regression layer. Touch taps use Playwright's touchscreen API. Multi-step touch drags use Chromium DevTools Protocol `Input.dispatchTouchEvent`, because Playwright does not expose a standard touchscreen drag sequence. These events reach the canvas as browser pointer events with `pointerType: "touch"`.

The touch suite verifies proxy selection, edge-grab offset, a single Move history entry, camera isolation, normal finish, pointer-capture loss, touch cancellation, transform rollback, and camera restoration. Cancel coverage releases the browser's real canvas pointer capture and then closes the CDP touch sequence; no editor/store mutation shortcut is used.

## Diagnostics contract

`window.__INTERIOR_MAGIC_TEST__` exists only under Vite `--mode test`. It is read-only and exposes project/session snapshots, live transforms, proxy CSS coordinates, renderer/cache state, camera position/target, camera-control availability, and observed interaction metadata. User actions still run through HTML controls and canvas pointer paths. Production Pages JavaScript does not install the global.

Runtime fixtures fail on uncaught exceptions, console errors, failed critical requests, and HTTP errors for application assets. Waiting uses locators, network state, and `expect.poll`; fixed sleeps are intentionally avoided.

## Limits

Chromium touch emulation does not reproduce Telegram native safe areas, device GPU drivers, physical touch latency, or Android/iOS WebView behavior. A synthetic standalone `pointercancel` is intentionally not used; the test exercises real pointer-capture loss and CDP touch cancellation instead. If another blocking browser family is added later, WebKit is the next useful candidate, but it is outside the current QA scope.

```text
Vitest
  ↓
Playwright Chromium mouse + touch
  ↓
physical Telegram Android/iOS WebView
```
