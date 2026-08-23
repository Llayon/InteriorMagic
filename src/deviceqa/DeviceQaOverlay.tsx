import { useEffect, useReducer, useState } from 'react';
import { deviceQa, installDeviceQaObservers, installDragPacingObserver, MANUAL_WINDOW_MS } from './deviceQa';

const CHECKPOINTS = ['A', 'B', 'C', 'D'] as const;
const MANUAL_WINDOWS = ['orbit', 'pinch', 'sheet'] as const;

export function DeviceQaOverlay() {
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  const [modalText, setModalText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubscribe = deviceQa.subscribe(refresh);
    const removeObservers = installDeviceQaObservers();
    const removeDragObserver = installDragPacingObserver();
    return () => { unsubscribe(); removeObservers(); removeDragObserver(); };
  }, []);

  const active = new Set(deviceQa.activeLabels());
  const last = deviceQa.completedWindows().at(-1);
  const copyReport = async () => {
    const text = deviceQa.reportJson();
    deviceQa.record('report-exported', deviceQa.checkpoint || 'unlabeled');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setModalText(text);
    }
  };

  return (
    <div className="device-qa glass" data-testid="device-qa">
      <div className="device-qa-row device-qa-title"><small>DEVICE QA</small><small>{deviceQa.checkpoint || '—'}</small></div>
      <div className="device-qa-row">
        {CHECKPOINTS.map((checkpoint) => (
          <button key={checkpoint} className="device-qa-chip" data-active={deviceQa.checkpoint === checkpoint} onClick={() => { deviceQa.checkpoint = deviceQa.checkpoint === checkpoint ? '' : checkpoint; refresh(); }}>{checkpoint}</button>
        ))}
      </div>
      <div className="device-qa-row">
        {MANUAL_WINDOWS.map((label) => (
          <button key={label} className="device-qa-chip" data-active={active.has(label)} disabled={active.size > 0 && !active.has(label)} onClick={() => deviceQa.beginWindow(label, MANUAL_WINDOW_MS)}>{label}</button>
        ))}
      </div>
      {last && <small className="device-qa-last">{last.label}: p50 {last.p50Ms} · p95 {last.p95Ms} · max {last.worstMs} ms · n {last.frames}</small>}
      <button className="device-qa-copy" data-testid="device-qa-copy" onClick={() => void copyReport()}>{copied ? 'copied ✓' : 'COPY REPORT'}</button>
      {modalText !== null && (
        <div className="dialog-backdrop">
          <div className="reset-dialog copy-dialog">
            <h2>Отчёт устройства</h2>
            <p>Скопируйте текст ниже и отправьте его в чат.</p>
            <textarea readOnly value={modalText} onFocus={(event) => event.currentTarget.select()} />
            <div><button onClick={() => setModalText(null)}>Закрыть</button></div>
          </div>
        </div>
      )}
    </div>
  );
}