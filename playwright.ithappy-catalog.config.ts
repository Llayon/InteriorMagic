import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';
const catalogUse = { browserName: 'chromium' as const, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: devices['Pixel 5'].userAgent };

export default defineConfig({
  testDir: './tests/catalog-local', workers: 1, fullyParallel: false, reporter: 'list', outputDir: 'test-results/ithappy-catalog',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'thumbnail-generator', testMatch: /generate-thumbnails\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 256, height: 192 }, deviceScaleFactor: 1 } },
    { name: 'mobile-short', testMatch: /catalog\.spec\.ts/, dependencies: ['thumbnail-generator'], use: { ...catalogUse, viewport: { width: 360, height: 700 } } },
    { name: 'mobile-small', testMatch: /catalog\.spec\.ts/, dependencies: ['thumbnail-generator'], use: { ...catalogUse, viewport: { width: 390, height: 844 } } },
    { name: 'mobile-large', testMatch: /catalog\.spec\.ts/, dependencies: ['thumbnail-generator'], use: { ...catalogUse, viewport: { width: 430, height: 932 } } },
    { name: 'desktop', testMatch: /catalog\.spec\.ts/, dependencies: ['thumbnail-generator'], use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort --mode test', url: baseURL, reuseExistingServer: false, timeout: 120_000 },
});
