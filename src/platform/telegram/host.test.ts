import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTelegramInitData, getTelegramSnapshot, subscribeTelegramLifecycle } from './host';

type Listener = () => void;

const installHost = (platform?: string) => {
  const events = new Map<string, Listener>();
  vi.stubGlobal('window', {
    Telegram: platform === undefined ? undefined : { WebApp: { ready: () => undefined, expand: () => undefined, platform, onEvent: (name: string, listener: Listener) => events.set(name, listener), offEvent: (name: string) => events.delete(name) } },
  });
  return events;
};

afterEach(() => { vi.unstubAllGlobals(); });

describe('getTelegramSnapshot', () => {
  it('reports ordinary browser mode when no host is present', () => {
    vi.stubGlobal('window', {});
    expect(getTelegramSnapshot()).toEqual({ insideTelegram: false });
  });

  it('treats a host with unknown platform as outside Telegram', () => {
    installHost('unknown');
    expect(getTelegramSnapshot()).toMatchObject({ insideTelegram: false, platform: 'unknown' });
  });

  it('exposes officially documented host fields inside Telegram', () => {
    const events = installHost('ios');
    expect(events.size).toBe(0);
    expect(getTelegramSnapshot()).toMatchObject({ insideTelegram: true, platform: 'ios' });
  });

  it('exposes fullscreen and expansion diagnostics when present', () => {
    const events = new Map<string, Listener>();
    vi.stubGlobal('window', {
      Telegram: {
        WebApp: {
          ready: () => undefined,
          expand: () => undefined,
          platform: 'ios',
          version: '8.0',
          isActive: true,
          isExpanded: true,
          viewportHeight: 800,
          viewportStableHeight: 820,
          isFullscreen: false,
          safeAreaInset: { top: 10, bottom: 20 },
          contentSafeAreaInset: { top: 24, bottom: 18 },
          onEvent: (name: string, listener: Listener) => events.set(name, listener),
          offEvent: (name: string) => events.delete(name),
        },
      },
    });
    expect(getTelegramSnapshot()).toMatchObject({
      insideTelegram: true,
      platform: 'ios',
      version: '8.0',
      isActive: true,
      isExpanded: true,
      viewportHeight: 800,
      viewportStableHeight: 820,
      isFullscreen: false,
      safeAreaInset: { top: 10, bottom: 20 },
      contentSafeAreaInset: { top: 24, bottom: 18 },
    });
  });

  it('accepts payload-aware listeners (fullscreen events)', () => {
    const events = new Map<string, (payload?: unknown) => void>();
    vi.stubGlobal('window', {
      Telegram: {
        WebApp: {
          ready: () => undefined,
          expand: () => undefined,
          platform: 'ios',
          onEvent: (name: string, listener: (payload?: unknown) => void) => events.set(name, listener),
          offEvent: (name: string) => events.delete(name),
        },
      },
    });
    // Listener with optional payload should be accepted.
    const snapshot = getTelegramSnapshot();
    expect(snapshot.insideTelegram).toBe(true);
    expect(events.size).toBe(0);
    // Verify host subscription accepts payload
    events.set('fullscreenFailed', (payload?: unknown) => {
      expect(payload).toEqual({ error: 'UNSUPPORTED' });
    });
    events.get('fullscreenFailed')?.({ error: 'UNSUPPORTED' });
  });
});

describe('getTelegramInitData', () => {
  it('returns raw initData when present', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData: 'query_id=abc&user=%7B%22id%22%3A1%7D&hash=xyz' } } });
    expect(getTelegramInitData()).toBe('query_id=abc&user=%7B%22id%22%3A1%7D&hash=xyz');
  });
  it('returns null outside Telegram', () => {
    vi.stubGlobal('window', {});
    expect(getTelegramInitData()).toBeNull();
  });
  it('returns null when initData is empty', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData: '' } } });
    expect(getTelegramInitData()).toBeNull();
  });
  it('does not expose initData via snapshot (privacy)', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData: 'raw', version: '8.0' } } });
    expect(getTelegramSnapshot()).not.toHaveProperty('initData');
  });
});

describe('subscribeTelegramLifecycle', () => {
  it('dispatches activated and deactivated events', () => {
    const events = installHost('android');
    const received: string[] = [];
    const unsubscribe = subscribeTelegramLifecycle((event) => received.push(event));
    expect(events.has('activated')).toBe(true);
    expect(events.has('deactivated')).toBe(true);
    events.get('activated')!();
    events.get('deactivated')!();
    expect(received).toEqual(['activated', 'deactivated']);
    unsubscribe();
    expect(events.size).toBe(0);
  });

  it('is a safe no-op without Telegram event APIs', () => {
    vi.stubGlobal('window', {});
    expect(subscribeTelegramLifecycle(() => undefined)()).toBeUndefined();
  });

  it('ignores hosts reporting the unknown browser platform', () => {
    installHost('unknown');
    expect(subscribeTelegramLifecycle(() => undefined)()).toBeUndefined();
  });
});