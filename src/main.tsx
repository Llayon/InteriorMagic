import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTelegram } from '@/telegram/telegram';
import { isAr0Enabled } from '@/ar0/releaseGate';
import '@/app/styles.css';

initTelegram();

const query = new URLSearchParams(window.location.search);
const requestedArRevision = query.has('ar') ? (query.get('ar') ?? '') : null;

const bootstrap = async () => {
  if (requestedArRevision !== null) {
    if (!isAr0Enabled()) {
      createRoot(document.getElementById('root')!).render(
        <main data-testid="ar0-disabled" aria-live="polite">
          <section><small>INTERIOR MAGIC</small><h1>AR недоступен</h1><p>Примерка в масштабе 1:1 пока не активирована.</p></section>
        </main>,
      );
      return;
    }
    const { ArLanding } = await import('@/ar0/ArLanding');
    createRoot(document.getElementById('root')!).render(
      <StrictMode><ArLanding revisionId={requestedArRevision} /></StrictMode>,
    );
    return;
  }
  document.getElementById('root')!.innerHTML = '<main data-testid="app-root" aria-busy="true"></main>';
  const editorBootstrap = import('@/app/bootstrapEditor');
  const requestedPlanningRoom = query.get('planning-test-room');
  if (requestedPlanningRoom === 'improved' || requestedPlanningRoom === 'already-good' || requestedPlanningRoom === 'no-tv') {
    // Warm the test-only integration fixture in parallel with the editor chunk;
    // this keeps the standalone AR route isolated while avoiding a nested Vite
    // dev-server import race in planner integration browsers.
    await import('@/app/demo/plannerIntegrationRoom');
  }
  const { bootstrapEditor } = await editorBootstrap;
  await bootstrapEditor();
};

void bootstrap().catch((error: unknown) => {
  console.error('InteriorMagic bootstrap failed', error);
});
