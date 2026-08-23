import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated Playwright config for the planner fixture harness suite.
 *
 * Uses its own port (4175) and FORBIDS reusing any pre-existing Vite on
 * that port, so a stale Vite launched without
 * VITE_PLANNER_FIXTURE_HARNESS_ENABLED can never be silently reused for
 * the planner tests.
 *
 * Run with:
 *   npx playwright test --config=playwright.planner.config.ts tests/e2e/planner-preview.spec.ts
 *
 * The global playwright.config.ts excludes both dedicated planner suites and
 * continues to serve the rest of the tests on port 4173.
 */

const baseURL = 'http://127.0.0.1:4175';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /planner-preview\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-small',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
        userAgent: devices['Pixel 5'].userAgent,
      },
    },
    {
      name: 'desktop',
      testIgnore: /interactions-touch\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort --mode test',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_PLANNER_FIXTURE_HARNESS_ENABLED: 'true',
    },
  },
});
