import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTelegram } from '@/telegram/telegram';
import { initIdentity } from '@/platform/identity/client';
import '@/app/styles.css';

initTelegram();
initIdentity();

const query = new URLSearchParams(window.location.search);
const requestedArRevision = query.has('ar') ? (query.get('ar') ?? '') : null;

const bootstrap = async () => {
  if (requestedArRevision !== null) {
    const { ArLanding } = await import('@/ar0/ArLanding');
    createRoot(document.getElementById('root')!).render(
      <StrictMode><ArLanding revisionId={requestedArRevision} /></StrictMode>,
    );
    return;
  }
  document.getElementById('root')!.innerHTML = '<main data-testid="app-root" aria-busy="true"></main>';
  const { bootstrapEditor } = await import('@/app/bootstrapEditor');
  await bootstrapEditor();
};

void bootstrap().catch((error: unknown) => {
  console.error('InteriorMagic bootstrap failed', error);
});
