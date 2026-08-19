import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { initTelegram } from '@/telegram/telegram';
import '@/app/styles.css';
import { installTestDiagnostics } from '@/test/diagnostics';
initTelegram();
installTestDiagnostics();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
