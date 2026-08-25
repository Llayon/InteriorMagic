export type IdentityState = 'anonymous' | 'authenticating' | 'authenticated' | 'failed';

export interface IdentitySnapshot {
  state: IdentityState;
  userId?: string;
}
