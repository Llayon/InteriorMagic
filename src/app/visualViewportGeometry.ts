export interface RootViewportRect {
  top: number;
  height: number;
}

export interface VisualViewportGeometry {
  offsetTop: number;
  height: number;
}

/**
 * Returns the part of a stable app root hidden below the visual viewport.
 * Safe-area and sheet geometry are intentionally excluded so callers can
 * compose each physical obstruction exactly once.
 */
export function calculateVisualViewportBottomObstruction(
  rootRect: RootViewportRect,
  viewport: VisualViewportGeometry | null,
): number {
  if (!viewport) return 0;
  const visibleBottomInsideRoot = viewport.offsetTop + viewport.height - rootRect.top;
  return Math.min(rootRect.height, Math.max(0, rootRect.height - visibleBottomInsideRoot));
}
