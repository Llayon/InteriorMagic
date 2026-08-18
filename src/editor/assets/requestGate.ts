export class LatestRequestGate {
  private current = 0;
  private listeners = new Set<() => void>();
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify() { this.listeners.forEach((listener) => listener()); }
  begin() { this.current += 1; this.notify(); return this.current; }
  isCurrent(requestId: number) { return requestId === this.current; }
  cancel() { this.current += 1; this.notify(); }
}

export const catalogRequestGate = new LatestRequestGate();
