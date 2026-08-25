import { afterEach, describe, expect, it } from 'vitest';
import { __resetIdentityForTests, getIdentitySnapshot, identityStore } from './store';

afterEach(() => __resetIdentityForTests());

describe('identity store', () => {
  it('starts anonymous', () => {
    expect(getIdentitySnapshot()).toEqual({ state: 'anonymous' });
  });

  it('transitions through authenticating to authenticated', () => {
    identityStore.setState('authenticating');
    expect(getIdentitySnapshot()).toEqual({ state: 'authenticating' });
    identityStore.setState('authenticated', 'user-123');
    expect(getIdentitySnapshot()).toEqual({ state: 'authenticated', userId: 'user-123' });
  });

  it('transitions to failed', () => {
    identityStore.setState('failed');
    expect(getIdentitySnapshot()).toEqual({ state: 'failed' });
  });

  it('notifies subscribers', () => {
    const received: string[] = [];
    const unsub = identityStore.subscribe((snap) => received.push(snap.state));
    identityStore.setState('authenticating');
    identityStore.setState('authenticated', 'u1');
    unsub();
    identityStore.setState('failed');
    expect(received).toEqual(['authenticating', 'authenticated']);
  });

  it('is separate from editor store (editor store not modified)', async () => {
    const { useEditorStore } = await import('@/editor/state/store');
    const before = useEditorStore.getState().project;
    identityStore.setState('authenticated', 'u1');
    expect(useEditorStore.getState().project).toBe(before);
  });
});
