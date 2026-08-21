import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { initTelegram } from '@/telegram/telegram';
import '@/app/styles.css';
import { installTestDiagnostics } from '@/test/diagnostics';
import { createBeautifulRoomProject } from '@/app/demo/beautifulRoom';
import { useEditorStore } from '@/editor/state/store';
initTelegram();
installTestDiagnostics();
const bootstrap = async () => {
  const query = new URLSearchParams(window.location.search);
  if (import.meta.env.MODE === 'test' && query.get('registry') === 'ithappy') {
    const { installIthappyRegistryPrototype } = await import('@/app/local/ithappyRegistryPrototype');
    await installIthappyRegistryPrototype();
  }
  if (query.get('demo') === '1') useEditorStore.setState({ project: createBeautifulRoomProject() });
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
};

void bootstrap();
