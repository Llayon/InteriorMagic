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
  document.getElementById('root')!.innerHTML = '<main data-testid="app-root" aria-busy="true"><p>Загрузка комнаты…</p></main>';
  // Keep the initial entry small. The editor pulls in Three.js and the catalog,
  // while the AR landing remains independently addressable on mobile.
  const { bootstrapEditor } = await import('@/app/bootstrapEditor');
  await bootstrapEditor();
};

void bootstrap().catch((error: unknown) => {
  console.error('InteriorMagic bootstrap failed', error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<main data-testid="app-load-error" role="alert"><p>Не удалось загрузить комнату. Обновите страницу.</p></main>';
  }
});
