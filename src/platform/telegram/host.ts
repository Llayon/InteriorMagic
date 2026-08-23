import type { TelegramInsets } from './types';

/** Single typed access point to the official Telegram WebApp host object.
 *  Field/event names follow https://core.telegram.org/bots/webapps:
 *  platform/version (Bot API 6.4+), isActive/safeAreaInset/contentSafeAreaInset
 *  and the activated/deactivated events (Bot API 8.0+). */

export interface TelegramWebAppHost {
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  /** One of 'android' | 'ios' | 'macos' | 'tdesktop' | 'web' | 'webk' | 'unigram' | 'unknown'. */
  platform?: string;
  version?: string;
  isActive?: boolean;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramInsets;
  contentSafeAreaInset?: TelegramInsets;
  onEvent?(event: string, listener: () => void): void;
  offEvent?(event: string, listener: () => void): void;
}

declare global { interface Window { Telegram?: { WebApp?: TelegramWebAppHost } } }

/** Returns the host object, or null outside Telegram. The official script
 *  exposes window.Telegram.WebApp even on the open web with platform
 *  'unknown', so presence alone does not mean "inside Telegram". */
export const getTelegramWebApp = (): TelegramWebAppHost | null => {
  try { return window.Telegram?.WebApp ?? null; } catch { return null; }
};

export interface TelegramSnapshot {
  insideTelegram: boolean;
  platform?: string;
  version?: string;
  isActive?: boolean;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramInsets;
  contentSafeAreaInset?: TelegramInsets;
}

export const getTelegramSnapshot = (): TelegramSnapshot => {
  const app = getTelegramWebApp();
  const insideTelegram = app !== null && app.platform !== undefined && app.platform !== 'unknown';
  if (!app) return { insideTelegram: false };
  return {
    insideTelegram,
    platform: app.platform,
    version: app.version,
    isActive: app.isActive,
    viewportStableHeight: app.viewportStableHeight,
    safeAreaInset: app.safeAreaInset,
    contentSafeAreaInset: app.contentSafeAreaInset,
  };
};

export type TelegramLifecycleEvent = 'activated' | 'deactivated';
type OffEventCapable = Required<Pick<TelegramWebAppHost, 'onEvent' | 'offEvent'>>;

/** Subscribes to Telegram background/resume signals. No-op (returns a cleanup)
 *  when the host or its event API is unavailable. */
export const subscribeTelegramLifecycle = (
  handler: (event: TelegramLifecycleEvent) => void,
): (() => void) => {
  const app = getTelegramWebApp();
  if (!app || !app.onEvent || !app.offEvent || app.platform === 'unknown') return () => undefined;
  const host = app as TelegramWebAppHost & OffEventCapable;
  const activated = () => handler('activated');
  const deactivated = () => handler('deactivated');
  host.onEvent('activated', activated);
  host.onEvent('deactivated', deactivated);
  return () => { host.offEvent('activated', activated); host.offEvent('deactivated', deactivated); };
};