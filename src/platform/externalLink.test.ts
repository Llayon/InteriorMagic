import { describe, expect, it, vi } from 'vitest';
import type { TelegramWebAppHost } from './telegram/host';
import { openExternalLink } from './externalLink';

const host = (overrides: Partial<TelegramWebAppHost> = {}): TelegramWebAppHost => ({
  ready: () => undefined,
  expand: () => undefined,
  platform: 'android',
  ...overrides,
});

describe('openExternalLink', () => {
  it('calls real Telegram openLink exactly once and synchronously', () => {
    const order: string[] = [];
    const openLink = vi.fn(() => order.push('openLink'));
    order.push('before');
    openExternalLink('https://example.test/?ar=sheen-chair-r1', { host: host({ openLink }), openBrowser: () => order.push('browser') });
    order.push('after');
    expect(openLink).toHaveBeenCalledOnce();
    expect(openLink).toHaveBeenCalledWith('https://example.test/?ar=sheen-chair-r1');
    expect(order).toEqual(['before', 'openLink', 'after']);
  });

  it('uses browser navigation outside Telegram', () => {
    const openBrowser = vi.fn();
    expect(() => openExternalLink('https://example.test/?ar=sheen-chair-r1', { host: null, openBrowser })).not.toThrow();
    expect(openBrowser).toHaveBeenCalledOnce();
  });

  it('falls back safely when Telegram throws', () => {
    const openBrowser = vi.fn();
    const openLink = vi.fn(() => { throw new Error('host failure'); });
    expect(() => openExternalLink('https://example.test/?ar=sheen-chair-r1', { host: host({ openLink }), openBrowser })).not.toThrow();
    expect(openLink).toHaveBeenCalledOnce();
    expect(openBrowser).toHaveBeenCalledOnce();
  });

  it('does not treat the unknown platform shim as Telegram', () => {
    const openBrowser = vi.fn();
    const openLink = vi.fn();
    openExternalLink('https://example.test/?ar=sheen-chair-r1', { host: host({ platform: 'unknown', openLink }), openBrowser });
    expect(openLink).not.toHaveBeenCalled();
    expect(openBrowser).toHaveBeenCalledOnce();
  });
});
