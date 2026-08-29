import { describe, expect, it } from 'vitest';
import { hasTelegramLaunchContext } from './sdkLoader';

describe('Telegram SDK launch detection', () => {
  it('does not classify an ordinary public URL as Telegram', () => {
    expect(hasTelegramLaunchContext({ search: '', hash: '' })).toBe(false);
    expect(hasTelegramLaunchContext({ search: '?demo=1', hash: '#room' })).toBe(false);
  });

  it('recognizes Telegram query and hash launch markers', () => {
    expect(hasTelegramLaunchContext({ search: '?tgWebAppPlatform=ios', hash: '' })).toBe(true);
    expect(hasTelegramLaunchContext({ search: '', hash: '#tgWebAppData=encoded' })).toBe(true);
  });
});
