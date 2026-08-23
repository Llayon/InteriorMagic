export interface FrameWindowStats {
  label: string;
  /** Rendered frames observed inside the window (excludes the first sample). */
  frames: number;
  durationMs: number;
  p50Ms: number;
  p95Ms: number;
  worstMs: number;
  over33Ms: number;
  shareOver33Ms: number;
  over50Ms: number;
  shareOver50Ms: number;
}

const round = (value: number) => Math.round(value * 10) / 10;

const percentile = (sorted: readonly number[], fraction: number): number => {
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index]!;
};

/** Pure statistics for intervals (ms) between consecutive rendered frames. */
export const computeFrameStats = (label: string, intervals: readonly number[], durationMs: number): FrameWindowStats => {
  const sorted = [...intervals].sort((a, b) => a - b);
  const over33 = sorted.filter((value) => value > 33);
  const over50 = sorted.filter((value) => value > 50);
  const frames = sorted.length;
  return {
    label,
    frames,
    durationMs: round(durationMs),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    worstMs: round(percentile(sorted, 1)),
    over33Ms: over33.length,
    shareOver33Ms: frames ? Math.round((over33.length / frames) * 1000) / 10 : 0,
    over50Ms: over50.length,
    shareOver50Ms: frames ? Math.round((over50.length / frames) * 1000) / 10 : 0,
  };
};

/** Observes real rendered frames only. The first sample of a window is skipped:
 *  in a demand-rendered app it follows idle time and is not a dropped frame.
 *  A fixed-duration window reports completion from observe() so the recorder
 *  never has to request frames itself. */
export class FrameWindow {
  private readonly intervals: number[] = [];
  private previous: number | null = null;

  constructor(
    readonly label: string,
    readonly openedAt: number,
    readonly fixedDurationMs?: number,
  ) {}

  /** @returns true when a fixed-duration window reached its capture budget. */
  observe(now: number): boolean {
    if (this.previous !== null) this.intervals.push(now - this.previous);
    this.previous = now;
    return this.fixedDurationMs !== undefined && now - this.openedAt >= this.fixedDurationMs;
  }

  close(now: number): FrameWindowStats {
    return computeFrameStats(this.label, this.intervals, now - this.openedAt);
  }
}