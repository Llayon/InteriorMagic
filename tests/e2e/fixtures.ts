import { expect, test as base, type Page, type Request, type Response } from '@playwright/test';

const isCriticalUrl = (url: string, page: Page) => {
  const parsed = new URL(url);
  const origin = new URL(page.url() || 'http://127.0.0.1:4173').origin;
  return parsed.origin === origin && (parsed.pathname === '/' || /\.(?:js|css|json|glb|usdz|webp|jpg|jpeg|png|svg)$/i.test(parsed.pathname) || parsed.pathname.startsWith('/src/'));
};

export const test = base.extend<{ monitoredPage: Page }>({
  monitoredPage: async ({ page }, use) => {
    const failures: string[] = [];
    await page.route('https://telegram.org/js/telegram-web-app.js**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
    });
    page.on('requestfailed', (request: Request) => {
      if (isCriticalUrl(request.url(), page)) failures.push(`requestfailed: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`);
    });
    page.on('response', (response: Response) => {
      if (response.status() >= 400 && isCriticalUrl(response.url(), page)) failures.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    // Playwright's fixture continuation is named `use`; it is not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    expect(failures, failures.join('\n')).toEqual([]);
  },
});

export { expect } from '@playwright/test';
