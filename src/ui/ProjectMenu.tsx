import { useState } from 'react';
import { useEditorStore } from '@/editor/state/store';

export function ProjectMenu({ disabled = false }: { disabled?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  return <div className="project-menu" data-planner-locked={disabled ? 'on' : 'off'}><button className="round glass" aria-label="Project menu" disabled={disabled} onClick={() => setOpen((value) => !value)}>•••</button>{!disabled && open && <div className="project-pop glass"><button aria-label="Save project" onClick={() => { useEditorStore.getState().save(); setOpen(false); }}>Сохранить</button><button aria-label="Load project" onClick={() => { useEditorStore.getState().load(); setOpen(false); }}>Загрузить</button><button aria-label="Reset project" className="danger-text" onClick={() => { setOpen(false); setConfirmReset(true); }}>Сбросить комнату</button></div>}
    {!disabled && confirmReset && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmReset(false); }}><div className="reset-dialog glass" role="dialog" aria-modal="true" aria-labelledby="reset-title"><h2 id="reset-title">Сбросить комнату?</h2><p>Вся расставленная мебель будет удалена.</p><div><button aria-label="Cancel reset" onClick={() => setConfirmReset(false)}>Отмена</button><button aria-label="Confirm reset" className="confirm-danger" autoFocus onClick={() => { useEditorStore.getState().reset(); setConfirmReset(false); }}>Сбросить</button></div></div></div>}
  </div>;
}
