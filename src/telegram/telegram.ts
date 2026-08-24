import { getTelegramWebApp, type TelegramWebAppHost } from '@/platform/telegram/host';

const applyViewport = (app: ReturnType<typeof getTelegramWebApp>) => {
  const root = document.documentElement;
  if (app?.viewportStableHeight) root.style.setProperty('--tg-viewport-stable-height', `${app.viewportStableHeight}px`);
  const inset = app?.contentSafeAreaInset ?? app?.safeAreaInset;
  if (inset) for (const edge of ['top', 'right', 'bottom', 'left'] as const) root.style.setProperty(`--tg-safe-${edge}`, `${inset[edge] ?? 0}px`);
};

const fullscreenRequestedHosts = new WeakSet<TelegramWebAppHost>();
let activeCleanup: (() => void) | null = null;

export const initTelegram = () => {
  const app = getTelegramWebApp();
  applyViewport(app);

  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  if (!app) return;

  app.ready();
  if (app.isExpanded !== true) app.expand();
  app.setHeaderColor?.('#eee9df');
  app.setBackgroundColor?.('#eee9df');

  const update = () => applyViewport(app);
  const onFullscreenFailed = (_payload?: unknown) => {
    void _payload;
    applyViewport(app);
  };

  const events: Array<[string, (payload?: unknown) => void]> = [
    ['viewportChanged', update],
    ['safeAreaChanged', update],
    ['contentSafeAreaChanged', update],
    ['fullscreenChanged', update],
    ['fullscreenFailed', onFullscreenFailed],
  ];

  for (const [event, handler] of events) app.onEvent?.(event, handler);
  activeCleanup = () => {
    for (const [event, handler] of events) app.offEvent?.(event, handler);
  };

  const insideTelegram = app.platform !== undefined && app.platform !== 'unknown';
  if (
    insideTelegram &&
    !app.isFullscreen &&
    app.requestFullscreen &&
    app.isVersionAtLeast?.('8.0') &&
    !fullscreenRequestedHosts.has(app)
  ) {
    fullscreenRequestedHosts.add(app);
    try {
      app.requestFullscreen();
    } catch {
      // fullscreen is best-effort; expanded fallback remains usable.
    }
  }
};

/** Test-only: resets per-host fullscreen guard and active subscriptions. */
export const __resetTelegramForTests = () => {
  if (activeCleanup) {
    // Keep offEvent handling best-effort for test stubs that may already be gone.
    try {
      activeCleanup();
    } catch {
      // ignore
    }
    activeCleanup = null;
  }
  // WeakSet has no clear(); callers should use a fresh host object per test.
};

export const __getTelegramTestState = () => ({ hasActiveSubscriptions: activeCleanup !== null });
