import { getTelegramWebApp, type TelegramWebAppHost } from './telegram/host';

export interface ExternalLinkDependencies {
  readonly host?: TelegramWebAppHost | null;
  readonly openBrowser?: (url: string) => void;
}

const openBrowserLink = (url: string) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
};

/** Deliberately synchronous so Telegram and browsers retain user activation. */
export const openExternalLink = (url: string, dependencies: ExternalLinkDependencies = {}): void => {
  const host = dependencies.host === undefined ? getTelegramWebApp() : dependencies.host;
  const openBrowser = dependencies.openBrowser ?? openBrowserLink;
  if (host?.platform && host.platform !== 'unknown' && host.openLink) {
    try {
      host.openLink(url);
      return;
    } catch {
      // A partially available Telegram host must not strand the click.
    }
  }
  openBrowser(url);
};
