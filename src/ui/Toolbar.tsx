import { useEditorStore } from '@/editor/state/store';

export function Toolbar() {
  const selected = useEditorStore((state) => state.session.selectedId);
  const undo = useEditorStore((state) => state.session.undoStack.length);
  const redo = useEditorStore((state) => state.session.redoStack.length);
  return <>
    <div className="global-toolbar glass" data-testid="global-toolbar"><button aria-label="Undo" disabled={!undo} onClick={() => useEditorStore.getState().undo()}>↶</button><button aria-label="Redo" disabled={!redo} onClick={() => useEditorStore.getState().redo()}>↷</button><button aria-label="Fit Room" onClick={() => useEditorStore.getState().requestFitRoom()}>⌂</button></div>
    {selected && <div className="object-toolbar glass" data-testid="object-toolbar"><button aria-label="Rotate left" onClick={() => useEditorStore.getState().rotate(selected, -1)}>↺</button><button aria-label="Rotate right" onClick={() => useEditorStore.getState().rotate(selected, 1)}>↻</button><button aria-label="Duplicate" onClick={() => useEditorStore.getState().duplicate(selected)}>⧉</button><button className="danger" aria-label="Delete" onClick={() => useEditorStore.getState().remove(selected)}>×</button></div>}
  </>;
}
