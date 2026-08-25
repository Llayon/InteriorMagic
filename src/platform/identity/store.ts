import type { IdentitySnapshot, IdentityState } from './types';

class IdentityStore {
  private state: IdentityState = 'anonymous';
  private userId?: string;
  private listeners = new Set<(snap: IdentitySnapshot) => void>();

  getSnapshot(): IdentitySnapshot {
    return this.userId ? { state: this.state, userId: this.userId } : { state: this.state };
  }

  setState(state: IdentityState, userId?: string) {
    this.state = state;
    this.userId = userId;
    this.notify();
  }

  subscribe(listener: (snap: IdentitySnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const snap = this.getSnapshot();
    for (const l of this.listeners) l(snap);
  }

  /** Test-only reset */
  resetForTests() {
    this.state = 'anonymous';
    this.userId = undefined;
    this.listeners.clear();
  }
}

export const identityStore = new IdentityStore();
export const getIdentitySnapshot = (): IdentitySnapshot => identityStore.getSnapshot();
export const subscribeIdentity = (listener: (snap: IdentitySnapshot) => void): (() => void) =>
  identityStore.subscribe(listener);
export const __resetIdentityForTests = () => identityStore.resetForTests();
