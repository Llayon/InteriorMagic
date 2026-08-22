import { useRef } from 'react';
import { SceneCanvas } from '@/scene/SceneCanvas';
import { DebugOverlay } from '@/scene/debug/DebugOverlay';
import { Toolbar } from '@/ui/Toolbar';
import { WorkspaceSheet } from '@/ui/WorkspaceSheet';
import { ProjectMenu } from '@/ui/ProjectMenu';
import { isDebugEnabled } from '@/shared/debug';
import { isDeviceQaEnabled } from '@/shared/deviceQa';
import { DeviceQaOverlay } from '@/deviceqa/DeviceQaOverlay';
import { useEditorStore } from '@/editor/state/store';
import { useWorkspaceGeometry } from './useWorkspaceGeometry';

export function App() {
  const rootRef = useRef<HTMLElement>(null);
  const sheetState = useEditorStore((state) => state.session.sheetState);
  const geometry = useWorkspaceGeometry(rootRef, sheetState);
  return <main ref={rootRef} data-testid="app-root" data-sheet-state={sheetState}><div className="safe-area-probe" aria-hidden="true" /><header data-testid="app-header"><div><small>INTERIOR MAGIC</small><h1>Моя комната</h1></div><ProjectMenu /></header><div className="scene" data-testid="scene"><SceneCanvas workspace={geometry} /><div className="hint">Перетаскивайте мебель одним пальцем</div><Toolbar />{isDebugEnabled && <DebugOverlay />}{isDeviceQaEnabled && <DeviceQaOverlay />}</div><WorkspaceSheet /></main>;
}
