import { useState } from 'react';
import { useEditorStore } from '@/editor/state/store';

export function ProjectMenu() {
  const [open, setOpen] = useState(false);
  return <div className="project-menu"><button className="round glass" aria-label="Project menu" onClick={() => setOpen((value) => !value)}>•••</button>{open && <div className="project-pop glass"><button aria-label="Save project" onClick={() => { useEditorStore.getState().save(); setOpen(false); }}>Сохранить</button><button aria-label="Load project" onClick={() => { useEditorStore.getState().load(); setOpen(false); }}>Загрузить</button><button aria-label="Reset project" className="danger-text" onClick={() => { if (confirm('Очистить комнату?')) useEditorStore.getState().reset(); setOpen(false); }}>Сбросить комнату</button></div>}</div>;
}
