import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import type { WorkspaceInsets } from '@/scene/camera/fitRoom';
import { calculateVisualViewportBottomObstruction } from './visualViewportGeometry';

export interface WorkspaceGeometry {
  width: number;
  height: number;
  insets: WorkspaceInsets;
  visualViewportBottomObstruction: number;
}
const empty: WorkspaceGeometry = {
  width: 1,
  height: 1,
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  visualViewportBottomObstruction: 0,
};

export function useWorkspaceGeometry(rootRef: RefObject<HTMLElement | null>, sheetState: string): WorkspaceGeometry {
  const [geometry, setGeometry] = useState(empty);
  const measure = useCallback(() => {
    const root = rootRef.current;
    const header = root?.querySelector<HTMLElement>('[data-testid="app-header"]');
    const sheet = root?.querySelector<HTMLElement>('[data-testid="workspace-sheet"]');
    const scene = root?.querySelector<HTMLElement>('[data-testid="scene"]');
    const probe = root?.querySelector<HTMLElement>('.safe-area-probe');
    if (!root || !header || !sheet || !scene || !probe) return;
    const rootRect = root.getBoundingClientRect();
    const visualViewportBottomObstruction = calculateVisualViewportBottomObstruction(rootRect, window.visualViewport);
    root.style.setProperty('--visual-viewport-bottom-obstruction', `${visualViewportBottomObstruction}px`);
    const sceneRect = scene.getBoundingClientRect(), headerRect = header.getBoundingClientRect(), sheetRect = sheet.getBoundingClientRect();
    const safe = getComputedStyle(probe);
    const mobile = rootRect.width < 700;
    const next: WorkspaceGeometry = { width: sceneRect.width, height: sceneRect.height, insets: mobile ? {
      top: Math.max(Number.parseFloat(safe.paddingTop) || 0, headerRect.bottom - sceneRect.top),
      right: Number.parseFloat(safe.paddingRight) || 0,
      bottom: Math.max(Number.parseFloat(safe.paddingBottom) || 0, sceneRect.bottom - sheetRect.top),
      left: Number.parseFloat(safe.paddingLeft) || 0,
    } : { top: 0, right: 0, bottom: 0, left: 0 }, visualViewportBottomObstruction };
    setGeometry((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  }, [rootRef]);
  useLayoutEffect(measure, [measure, sheetState]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const header = root.querySelector<HTMLElement>('[data-testid="app-header"]'), sheet = root.querySelector<HTMLElement>('[data-testid="workspace-sheet"]');
    const observer = new ResizeObserver(measure); observer.observe(root); if (header) observer.observe(header);
    sheet?.addEventListener('transitionend', measure);
    window.visualViewport?.addEventListener('resize', measure); window.visualViewport?.addEventListener('scroll', measure);
    const styleObserver = new MutationObserver(measure); styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    const timer = window.setTimeout(measure, 240);
    return () => { observer.disconnect(); styleObserver.disconnect(); sheet?.removeEventListener('transitionend', measure); window.visualViewport?.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('scroll', measure); window.clearTimeout(timer); };
  }, [measure, rootRef, sheetState]);
  return geometry;
}
