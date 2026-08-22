import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The production flag reads window.location; unit tests exercise window
// mechanics directly by forcing the opt-in flag on.
vi.mock('@/shared/deviceQa', () => ({ isDeviceQaEnabled: true }));

const { DeviceQa } = await import('./deviceQa');

/** DeviceQa is importable outside the browser: the device-QA flag and host
 *  access are guarded, and editor store initialization tolerates missing
 *  localStorage. These tests use fake timers to prove wall-clock window
 *  closing without any frame observation. */
describe('DeviceQa fixed-duration windows', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('closes a fixed window on the wall-clock timer at exactly its duration, even with zero frames', () => {
    const qa = new DeviceQa();
    qa.beginWindow('orbit', 5000);
    vi.advanceTimersByTime(4999);
    expect(qa.activeLabels()).toContain('orbit');
    vi.advanceTimersByTime(1);
    const stats = qa.completedWindows().at(-1);
    expect(qa.activeLabels()).not.toContain('orbit');
    expect(stats).toMatchObject({ label: 'orbit', frames: 0, durationMs: 5000 });
  });

  it('does not record a late idle interval after interaction stops before the window ends', () => {
    const qa = new DeviceQa();
    qa.beginWindow('pinch', 5000);
    qa.observeFrame(100);
    qa.observeFrame(133); // gesture runs briefly...
    qa.observeFrame(150); // ...then stops; no frames until long after
    vi.advanceTimersByTime(5000);
    qa.observeFrame(60_000); // a stray frame long after close must not reopen or extend anything
    const stats = qa.completedWindows().at(-1);
    expect(qa.completedWindows()).toHaveLength(1);
    expect(stats).toMatchObject({ label: 'pinch', frames: 2, worstMs: 33 });
    expect(stats?.durationMs).toBe(5000);
  });

  it('keeps an open-ended drag window open past short durations and closes only via endWindow', () => {
    const qa = new DeviceQa();
    qa.beginWindow('drag');
    vi.advanceTimersByTime(29_000);
    expect(qa.activeLabels()).toContain('drag');
    qa.endWindow('drag');
    expect(qa.activeLabels()).not.toContain('drag');
    expect(qa.completedWindows().at(-1)?.label).toBe('drag');
  });
});