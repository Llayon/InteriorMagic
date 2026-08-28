import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /showcase-production\.spec\.ts/,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'showcase-production', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
