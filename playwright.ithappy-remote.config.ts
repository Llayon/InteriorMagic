import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/remote-delivery', workers: 1, fullyParallel: false, reporter: 'list', outputDir: 'test-results/ithappy-remote',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['Pixel 5'],
    launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks'] },
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
});
