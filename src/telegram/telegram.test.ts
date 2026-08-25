import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTelegramSnapshot } from '@/platform/telegram/host';
import { __resetTelegramForTests, initTelegram } from './telegram';

type TelegramListener = (payload?: unknown) => void;

interface MockHost {
  ready: ReturnType<typeof vi.fn>;
  expand: ReturnType<typeof vi.fn>;
  setHeaderColor?: ReturnType<typeof vi.fn>;
  setBackgroundColor?: ReturnType<typeof vi.fn>;
  platform?: string;
  version?: string;
  isActive?: boolean;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  isFullscreen?: boolean;
  safeAreaInset?: { top?: number; right?: number; bottom?: number; left?: number };
  contentSafeAreaInset?: { top?: number; right?: number; bottom?: number; left?: number };
  isVersionAtLeast?: ReturnType<typeof vi.fn>;
  requestFullscreen?: ReturnType<typeof vi.fn>;
  exitFullscreen?: ReturnType<typeof vi.fn>;
  onEvent: ReturnType<typeof vi.fn>;
  offEvent: ReturnType<typeof vi.fn>;
  _events: Map<string, TelegramListener>;
}

const createMockHost = (overrides: Partial<MockHost> = {}): MockHost => {
  const events = new Map<string, TelegramListener>();
  const host: MockHost = {
    ready: vi.fn(),
    expand: vi.fn(),
    setHeaderColor: vi.fn(),
    setBackgroundColor: vi.fn(),
    platform: 'ios',
    version: '8.0',
    isActive: true,
    isExpanded: false,
    viewportHeight: 780,
    viewportStableHeight: 820,
    isFullscreen: false,
    onEvent: vi.fn((event: string, listener: TelegramListener) => {
      events.set(event, listener);
    }),
    offEvent: vi.fn((event: string) => {
      events.delete(event);
    }),
    _events: events,
    isVersionAtLeast: vi.fn((v: string) => v === '8.0'),
    requestFullscreen: vi.fn(),
    exitFullscreen: vi.fn(),
    ...overrides,
  };
  if (!overrides._events) host._events = events;
  if (overrides.onEvent) host.onEvent = overrides.onEvent;
  if (overrides.offEvent) host.offEvent = overrides.offEvent;
  if (overrides._events) host._events = overrides._events;
  if (!overrides.onEvent && !overrides._events) {
    host.onEvent = vi.fn((event: string, listener: TelegramListener) => events.set(event, listener));
    host.offEvent = vi.fn((event: string) => events.delete(event));
    host._events = events;
  }
  return host;
};

const installHost = (host: MockHost | null) => {
  if (host === null) {
    vi.stubGlobal('window', {});
    return;
  }
  const { _events: _unused, ...webApp } = host;
  void _unused;
  vi.stubGlobal('window', {
    Telegram: { WebApp: webApp },
  });
};

let mockStyle: {
  _props: Map<string, string>;
  setProperty: ReturnType<typeof vi.fn>;
  getPropertyValue: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  const props = new Map<string, string>();
  mockStyle = {
    _props: props,
    setProperty: vi.fn((k: string, v: string) => props.set(k, v)),
    getPropertyValue: vi.fn((k: string) => props.get(k) ?? ''),
  };
  vi.stubGlobal('document', {
    documentElement: { style: mockStyle },
  });
});

afterEach(() => {
  __resetTelegramForTests();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('initTelegram bootstrap policy', () => {
  it('safe no-op in ordinary browser (no host)', () => {
    installHost(null);
    expect(() => initTelegram()).not.toThrow();
    const host = createMockHost();
    expect(host.requestFullscreen).not.toHaveBeenCalled();
    expect(mockStyle.getPropertyValue('--tg-viewport-stable-height')).toBe('');
  });

  it('safe no-op for unknown platform host (no fullscreen)', () => {
    const host = createMockHost({ platform: 'unknown', isExpanded: false });
    installHost(host);
    expect(() => initTelegram()).not.toThrow();
    expect(host.requestFullscreen).not.toHaveBeenCalled();
  });

  it('pre-8.0 Telegram remains expand-only', () => {
    const host = createMockHost({
      platform: 'ios',
      version: '7.5',
      isExpanded: false,
      isFullscreen: false,
      isVersionAtLeast: vi.fn(() => false),
    });
    installHost(host);
    initTelegram();
    expect(host.expand).toHaveBeenCalledTimes(1);
    expect(host.requestFullscreen).not.toHaveBeenCalled();
  });

  it('supported host requests fullscreen exactly once', () => {
    const host = createMockHost({
      platform: 'ios',
      isExpanded: false,
      isFullscreen: false,
      isVersionAtLeast: vi.fn((v: string) => v === '8.0'),
    });
    installHost(host);
    initTelegram();
    expect(host.ready).toHaveBeenCalledTimes(1);
    expect(host.expand).toHaveBeenCalledTimes(1);
    expect(host.requestFullscreen).toHaveBeenCalledTimes(1);
    // Freeze ordering: ready → expand → requestFullscreen
    const readyOrder = host.ready.mock.invocationCallOrder[0]!;
    const expandOrder = host.expand.mock.invocationCallOrder[0]!;
    const fullscreenOrder = host.requestFullscreen!.mock.invocationCallOrder[0]!;
    expect(readyOrder).toBeLessThan(expandOrder);
    expect(expandOrder).toBeLessThan(fullscreenOrder);
  });

  it('already fullscreen does not request again', () => {
    const host = createMockHost({
      platform: 'ios',
      isFullscreen: true,
      isExpanded: true,
      isVersionAtLeast: vi.fn(() => true),
    });
    installHost(host);
    initTelegram();
    expect(host.requestFullscreen).not.toHaveBeenCalled();
    expect(host.expand).not.toHaveBeenCalled();
  });

  it('avoids unnecessary expand when already expanded', () => {
    const host = createMockHost({
      platform: 'android',
      isExpanded: true,
      isFullscreen: false,
      isVersionAtLeast: vi.fn(() => false),
    });
    installHost(host);
    initTelegram();
    expect(host.expand).not.toHaveBeenCalled();
    expect(host.ready).toHaveBeenCalledTimes(1);
  });

  it('fullscreenFailed is non-fatal and keeps expanded fallback', () => {
    const host = createMockHost({
      platform: 'ios',
      isExpanded: false,
      isFullscreen: false,
      isVersionAtLeast: vi.fn(() => true),
      viewportStableHeight: 800,
      contentSafeAreaInset: { top: 10, bottom: 12 },
    });
    installHost(host);
    initTelegram();
    expect(host.requestFullscreen).toHaveBeenCalledTimes(1);
    const failed = host._events.get('fullscreenFailed');
    expect(failed).toBeDefined();
    expect(() => failed?.({ error: 'UNSUPPORTED' })).not.toThrow();
    expect(host.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(host.expand).toHaveBeenCalledTimes(1);
    expect(mockStyle._props.get('--tg-safe-top')).toBe('10px');
    expect(getTelegramSnapshot().insideTelegram).toBe(true);
  });

  it('fullscreenChanged refreshes snapshot and geometry', () => {
    const host = createMockHost({
      platform: 'ios',
      isExpanded: false,
      isFullscreen: false,
      viewportStableHeight: 820,
      contentSafeAreaInset: { top: 24, right: 13, bottom: 18, left: 11 },
      isVersionAtLeast: vi.fn(() => true),
    });
    installHost(host);
    initTelegram();
    expect(mockStyle._props.get('--tg-safe-left')).toBe('11px');
    const webApp = (window as unknown as { Telegram: { WebApp: MockHost } }).Telegram.WebApp;
    webApp.contentSafeAreaInset = { top: 50, right: 0, bottom: 0, left: 0 };
    webApp.viewportStableHeight = 900;
    const changed = host._events.get('fullscreenChanged');
    expect(changed).toBeDefined();
    changed?.();
    expect(mockStyle._props.get('--tg-safe-top')).toBe('50px');
    expect(mockStyle._props.get('--tg-viewport-stable-height')).toBe('900px');
  });

  it('safe-area changes after fullscreen are applied', () => {
    const host = createMockHost({
      platform: 'ios',
      viewportStableHeight: 800,
      safeAreaInset: { top: 10, bottom: 20 },
      contentSafeAreaInset: { top: 24, bottom: 18 },
      isVersionAtLeast: vi.fn(() => true),
    });
    installHost(host);
    initTelegram();
    expect(mockStyle._props.get('--tg-safe-top')).toBe('24px');
    expect(mockStyle._props.get('--tg-safe-bottom')).toBe('18px');
    const webApp = (window as unknown as { Telegram: { WebApp: MockHost } }).Telegram.WebApp;
    webApp.contentSafeAreaInset = { top: 60, bottom: 10 };
    host._events.get('safeAreaChanged')?.();
    expect(mockStyle._props.get('--tg-safe-top')).toBe('60px');
    webApp.contentSafeAreaInset = { top: 5, bottom: 5 };
    host._events.get('contentSafeAreaChanged')?.();
    expect(mockStyle._props.get('--tg-safe-top')).toBe('5px');
  });

  it('prefers contentSafeAreaInset over safeAreaInset', () => {
    const host = createMockHost({
      platform: 'ios',
      safeAreaInset: { top: 44, right: 5, bottom: 20, left: 5 },
      contentSafeAreaInset: { top: 60, right: 13, bottom: 10, left: 11 },
      isVersionAtLeast: vi.fn(() => true),
    });
    installHost(host);
    initTelegram();
    expect(mockStyle._props.get('--tg-safe-top')).toBe('60px');
    expect(mockStyle._props.get('--tg-safe-bottom')).toBe('10px');
    expect(mockStyle._props.get('--tg-safe-right')).toBe('13px');
  });

  it('does not accumulate listeners on repeated initialization (idempotent)', () => {
    const host = createMockHost({
      platform: 'ios',
      isVersionAtLeast: vi.fn(() => true),
    });
    installHost(host);
    initTelegram();
    expect(host.onEvent).toHaveBeenCalledTimes(5);
    expect(host._events.size).toBe(5);
    initTelegram();
    expect(host.offEvent).toHaveBeenCalledTimes(5);
    expect(host.onEvent).toHaveBeenCalledTimes(10);
    expect(host._events.size).toBe(5);
    expect(host.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('per-host WeakSet guard allows new host to request again', () => {
    const host1 = createMockHost({ platform: 'ios', isVersionAtLeast: vi.fn(() => true) });
    installHost(host1);
    initTelegram();
    expect(host1.requestFullscreen).toHaveBeenCalledTimes(1);

    const host2 = createMockHost({ platform: 'ios', isVersionAtLeast: vi.fn(() => true) });
    installHost(host2);
    initTelegram();
    expect(host2.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(host1.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('viewportChanged also refreshes geometry', () => {
    const host = createMockHost({
      platform: 'ios',
      viewportStableHeight: 700,
      isVersionAtLeast: vi.fn(() => true),
    });
    installHost(host);
    initTelegram();
    expect(mockStyle._props.get('--tg-viewport-stable-height')).toBe('700px');
    const webApp = (window as unknown as { Telegram: { WebApp: MockHost } }).Telegram.WebApp;
    webApp.viewportStableHeight = 750;
    host._events.get('viewportChanged')?.();
    expect(mockStyle._props.get('--tg-viewport-stable-height')).toBe('750px');
  });

  it('requestFullscreen exception is swallowed (best-effort)', () => {
    const host = createMockHost({
      platform: 'ios',
      isVersionAtLeast: vi.fn(() => true),
      requestFullscreen: vi.fn(() => {
        throw new Error('unexpected');
      }),
    });
    installHost(host);
    expect(() => initTelegram()).not.toThrow();
    expect(host.requestFullscreen).toHaveBeenCalledTimes(1);
  });
});
