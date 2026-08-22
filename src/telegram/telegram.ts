import { getTelegramWebApp } from '@/platform/telegram/host';

const applyViewport = (app: ReturnType<typeof getTelegramWebApp>) => {
  const root = document.documentElement;
  if (app?.viewportStableHeight) root.style.setProperty('--tg-viewport-stable-height', `${app.viewportStableHeight}px`);
  const inset = app?.contentSafeAreaInset ?? app?.safeAreaInset;
  if (inset) for (const edge of ['top', 'right', 'bottom', 'left'] as const) root.style.setProperty(`--tg-safe-${edge}`, `${inset[edge] ?? 0}px`);
};

export const initTelegram = () => {
  const app = getTelegramWebApp();
  applyViewport(app);
  if (!app) return;
  app.ready(); app.expand(); app.setHeaderColor?.('#eee9df'); app.setBackgroundColor?.('#eee9df');
  const update = () => applyViewport(app);
  app.onEvent?.('viewportChanged', update); app.onEvent?.('safeAreaChanged', update); app.onEvent?.('contentSafeAreaChanged', update);
};
