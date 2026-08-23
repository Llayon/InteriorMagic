import { describe, expect, it } from 'vitest';
import { computeFrameStats, FrameWindow } from './framePacing';

describe('computeFrameStats', () => {
  it('computes percentiles, worst frame and threshold shares', () => {
    const intervals = [16, 16, 16, 17, 17, 18, 20, 25, 34, 55];
    const stats = computeFrameStats('orbit', intervals, 264);
    expect(stats.frames).toBe(10);
    expect(stats.p50Ms).toBe(17);
    expect(stats.p95Ms).toBe(55);
    expect(stats.worstMs).toBe(55);
    expect(stats.over33Ms).toBe(2);
    expect(stats.shareOver33Ms).toBe(20);
    expect(stats.over50Ms).toBe(1);
    expect(stats.shareOver50Ms).toBe(10);
  });

  it('returns zeros for an empty window', () => {
    expect(computeFrameStats('drag', [], 0)).toMatchObject({ frames: 0, p50Ms: 0, p95Ms: 0, worstMs: 0 });
  });
});

describe('FrameWindow', () => {
  it('skips the first sample after idle and records only real intervals', () => {
    const window = new FrameWindow('orbit', 1000);
    window.observe(5000); // idle gap before the gesture must not count as a frame interval
    window.observe(5016);
    window.observe(5033);
    expect(window.close(5033)).toMatchObject({ frames: 2, durationMs: 4033, worstMs: 17 });
  });

  it('completes a fixed-duration window from observation alone', () => {
    const window = new FrameWindow('sheet', 0, 500);
    expect(window.observe(200)).toBe(false);
    expect(window.observe(400)).toBe(false);
    expect(window.observe(520)).toBe(true);
    const stats = window.close(520);
    expect(stats.label).toBe('sheet');
    expect(stats.durationMs).toBe(520);
    expect(stats.frames).toBe(2);
  });

  it('keeps observing past the budget when nothing is rendered', () => {
    const window = new FrameWindow('pinch', 0, 500);
    expect(window.observe(100)).toBe(false);
    expect(window.observe(9000)).toBe(true);
  });
});