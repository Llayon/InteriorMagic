import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';
const ar0EnabledBaseURL = 'http://127.0.0.1:4174';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: /planner-(?:preview|integration|intent)\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // CI's software renderer is resource-constrained; parallel browser contexts can
  // starve WebGL and make the editor persistence coverage nondeterministic.
  workers: process.env.CI ? 1 : 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-short',
      testMatch: /(?:interactions-touch|responsive)\.spec\.ts/,
      use: { browserName: 'chromium', viewport: { width: 360, height: 700 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: devices['Pixel 5'].userAgent },
    },
    {
      name: 'mobile-small',
      testIgnore: /(?:ar0(?:-disabled)?|planner-(?:preview|integration|intent))\.spec\.ts/,
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: devices['Pixel 5'].userAgent },
    },
    {
      name: 'mobile-large',
      testMatch: /(?:responsive|beautiful-room)\.spec\.ts/,
      use: { browserName: 'chromium', viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: devices['Pixel 5'].userAgent },
    },
    {
      name: 'desktop',
      testIgnore: /(?:ar0(?:-disabled)?|interactions-touch|planner-(?:preview|integration|intent))\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // Native-AR landing tests instantiate model-viewer, which owns a separate
    // WebGL renderer. Dedicated projects keep that renderer out of the editor
    // worker process while retaining the same mobile and desktop assertions.
    {
      name: 'ar0-mobile-small',
      testMatch: /ar0\.spec\.ts/,
      use: { baseURL: ar0EnabledBaseURL, browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: devices['Pixel 5'].userAgent },
    },
    {
      name: 'ar0-desktop',
      testMatch: /ar0\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: ar0EnabledBaseURL, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'ar0-default-off',
      testMatch: /ar0-disabled\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort --mode test',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'node scripts/ar0/run-enabled-e2e-server.mjs',
      url: ar0EnabledBaseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
