import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: /planner-(?:preview|integration|intent)\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Several parallel WebGL + PMREM contexts can starve software-rendered local/CI GPUs.
  workers: process.env.CI ? 1 : 4,
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
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: devices['Pixel 5'].userAgent },
    },
    {
      name: 'mobile-large',
      testMatch: /(?:responsive|beautiful-room)\.spec\.ts/,
      use: { browserName: 'chromium', viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: devices['Pixel 5'].userAgent },
    },
    {
      name: 'desktop',
      testIgnore: /(?:interactions-touch|planner-(?:preview|integration|intent))\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort --mode test',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
