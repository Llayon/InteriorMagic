import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4177';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /planner-intent\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'mobile-small', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4177 --strictPort --mode test',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...process.env, VITE_PLANNING_INTENT_ENDPOINT: 'https://intent.test/planning-intent' },
  },
});
