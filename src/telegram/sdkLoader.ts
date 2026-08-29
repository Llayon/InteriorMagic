import { getTelegramWebApp } from '@/platform/telegram/host';

const TELEGRAM_SDK_URL = 'https://telegram.org/js/telegram-web-app.js?63';
const TELEGRAM_LAUNCH_KEYS = ['tgWebAppData', 'tgWebAppVersion', 'tgWebAppPlatform', 'tgWebAppThemeParams'] as const;

export type TelegramSdkStatus = 'ready' | 'not-telegram' | 'unavailable';

export const hasTelegramLaunchContext = (locationLike: Pick<Location, 'search' | 'hash'> = window.location) => {
  const sources = [locationLike.search, locationLike.hash.startsWith('#') ? locationLike.hash.slice(1) : locationLike.hash];
  return sources.some((source) => {
    const params = new URLSearchParams(source);
    return TELEGRAM_LAUNCH_KEYS.some((key) => params.has(key));
  });
};

/** Load Telegram's SDK only for a Telegram launch, without blocking the app. */
export const ensureTelegramWebAppSdk = (timeoutMs = 5_000): Promise<TelegramSdkStatus> => {
  if (getTelegramWebApp()) return Promise.resolve('ready');
  if (!hasTelegramLaunchContext()) return Promise.resolve('not-telegram');
  const existing = Array.from(document.scripts).find((script) => script.src === TELEGRAM_SDK_URL);
  const script = existing ?? document.createElement('script');
  if (!existing) {
    script.src = TELEGRAM_SDK_URL;
    script.async = true;
    document.head.appendChild(script);
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const finish = (status: TelegramSdkStatus) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      resolve(status);
    };
    const onLoad = () => finish(getTelegramWebApp() ? 'ready' : 'unavailable');
    const onError = () => finish('unavailable');
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    timer = window.setTimeout(() => finish(getTelegramWebApp() ? 'ready' : 'unavailable'), timeoutMs);
  });
};
