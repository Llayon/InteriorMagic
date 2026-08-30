import { defineConfig, devices } from '@playwright/test';

// Local-only: the showcase bytes are licensed and intentionally never enter CI.
export default defineConfig({
  testDir: './tests/e2e', testMatch: /showcase(?:-startup-resilience)?\.spec\.ts/, workers: 1, retries: 0,
  reporter: 'list', use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'showcase-mobile', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
    { name: 'showcase-mobile-large', use: { ...devices['Pixel 5'], viewport: { width: 430, height: 932 } } },
    { name: 'showcase-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort --mode test', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 120_000, env: { ...process.env, VITE_PLANNING_INTENT_ENDPOINT: 'https://intent.test/planning-intent' } },
});
