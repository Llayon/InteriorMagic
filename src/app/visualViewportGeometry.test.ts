import { describe, expect, it } from 'vitest';
import { calculateVisualViewportBottomObstruction } from './visualViewportGeometry';

describe('calculateVisualViewportBottomObstruction', () => {
  it('returns zero when the visual viewport reaches the stable root bottom', () => {
    expect(calculateVisualViewportBottomObstruction(
      { top: 0, height: 844 },
      { offsetTop: 0, height: 844 },
    )).toBe(0);
  });

  it('measures bottom browser chrome without adding the visual top offset twice', () => {
    expect(calculateVisualViewportBottomObstruction(
      { top: 0, height: 844 },
      { offsetTop: 44, height: 756 },
    )).toBe(44);
  });

  it('accounts for a root that starts below the layout viewport origin', () => {
    expect(calculateVisualViewportBottomObstruction(
      { top: 20, height: 824 },
      { offsetTop: 20, height: 760 },
    )).toBe(64);
  });

  it('clamps a fully obscured root and supports browsers without visualViewport', () => {
    expect(calculateVisualViewportBottomObstruction(
      { top: 100, height: 500 },
      { offsetTop: 0, height: 50 },
    )).toBe(500);
    expect(calculateVisualViewportBottomObstruction({ top: 0, height: 844 }, null)).toBe(0);
  });
});
