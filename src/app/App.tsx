import { SceneCanvas } from '@/scene/SceneCanvas';
import { DebugOverlay } from '@/scene/debug/DebugOverlay';
import { Toolbar } from '@/ui/Toolbar';
import { Catalog } from '@/ui/Catalog';
import { Finishes } from '@/ui/Finishes';
import { ProjectMenu } from '@/ui/ProjectMenu';

export function App() {
  return <main><header><div><small>INTERIOR MAGIC</small><h1>Моя комната</h1></div><ProjectMenu /></header><div className="scene"><SceneCanvas /><div className="hint">Перетаскивайте мебель одним пальцем</div><Toolbar /><Finishes />{import.meta.env.DEV && <DebugOverlay />}</div><Catalog /></main>;
}
