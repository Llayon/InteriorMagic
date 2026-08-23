import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTelegramSnapshot, subscribeTelegramLifecycle } from './host';

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