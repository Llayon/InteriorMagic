import { SceneCanvas } from '@/scene/SceneCanvas';
import { DebugOverlay } from '@/scene/debug/DebugOverlay';
import { Toolbar } from '@/ui/Toolbar';
import { WorkspaceSheet } from '@/ui/WorkspaceSheet';
import { ProjectMenu } from '@/ui/ProjectMenu';
import { isDebugEnabled } from '@/shared/debug';

export function App() {
  return <main data-testid="app-root"><header data-testid="app-header"><div><small>INTERIOR MAGIC</small><h1>Моя комната</h1></div><ProjectMenu /></header><div className="scene" data-testid="scene"><SceneCanvas /><div className="hint">Перетаскивайте мебель одним пальцем</div><Toolbar />{isDebugEnabled && <DebugOverlay />}</div><WorkspaceSheet /></main>;
}
