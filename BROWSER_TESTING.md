# Browser testing

Playwright Chromium is the browser QA layer between domain tests and physical Telegram WebView checks.

## Setup and commands

Install dependencies and the local Chromium build:

```bash
npm ci
npm run playwright:install
```

Run the complete matrix or an interactive variant:

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
```

Playwright starts Vite automatically on `127.0.0.1:4173` in the dedicated `test` mode. The configured projects are `mobile-small` (390×844), `mobile-large` (430×932), and `desktop` (1440×900). Select one with `--project=mobile-small`.

Failure screenshots, videos, traces, and context are written to `test-results/`; the HTML report is written to `playwright-report/`. Open a trace with `npx playwright show-trace path/to/trace.zip`. GitHub Actions uploads both directories when E2E fails.

## Diagnostics contract

`window.__INTERIOR_MAGIC_TEST__` exists only when Vite runs with `--mode test`. It is read-only and exposes project/session snapshots, live rendered transforms, interaction-proxy CSS coordinates, renderer counters, and AssetCache state. Tests still add, select, drag, rotate, save, and reload through real UI/pointer paths. Production Pages builds do not install this global.

Runtime fixtures fail on uncaught exceptions, console errors, and failed critical same-origin document, JS, CSS, thumbnail, or GLB requests. Waiting uses locators, network state, and `expect.poll`; fixed sleeps are intentionally avoided.

## Limits

Chromium emulation validates browser behavior and responsive layout, not Telegram's native safe areas, GPU drivers, touch latency, or Android/iOS WebView integration. Release confidence therefore follows this pyramid:

```text
Vitest domain/unit tests
        ↓
Playwright Chromium E2E
        ↓
physical Telegram Android/iOS WebView
```
