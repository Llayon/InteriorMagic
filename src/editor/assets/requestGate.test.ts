import { describe, expect, it } from 'vitest';
import { LatestRequestGate } from './requestGate';

describe('LatestRequestGate', () => {
  it('accepts only the latest request and invalidates on cancel', () => {
    const gate = new LatestRequestGate(); let notifications = 0; gate.subscribe(() => { notifications += 1; });
    const first = gate.begin(); const second = gate.begin();
    expect(gate.isCurrent(first)).toBe(false); expect(gate.isCurrent(second)).toBe(true);
    gate.cancel(); expect(gate.isCurrent(second)).toBe(false); expect(notifications).toBe(3);
  });
  it('prevents a slower stale load from producing an add result', async () => {
    const gate = new LatestRequestGate(); const added: string[] = [];
    let resolveFirst!: () => void; let resolveSecond!: () => void;
    const firstLoad = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const secondLoad = new Promise<void>((resolve) => { resolveSecond = resolve; });
    const firstId = gate.begin(); const first = firstLoad.then(() => { if (gate.isCurrent(firstId)) added.push('sofa'); });
    const secondId = gate.begin(); const second = secondLoad.then(() => { if (gate.isCurrent(secondId)) added.push('chair'); });
    resolveSecond(); await second; resolveFirst(); await first;
    expect(added).toEqual(['chair']);
  });
});
