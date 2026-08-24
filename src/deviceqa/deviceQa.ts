import * as THREE from 'three';
import { getTelegramSnapshot, subscribeTelegramLifecycle } from '@/platform/telegram/host';
import { assetCache } from '@/scene/assets/AssetCache';
import { isDeviceQaEnabled } from '@/shared/deviceQa';
import { useEditorStore } from '@/editor/state/store';
import { assembleReport, type DeviceReportInput, type LifecycleEventRecord, type RendererSnapshot } from './deviceReport';
import { FrameWindow, type FrameWindowStats } from './framePacing';
import { aggregateTextureEstimate, scanSceneTextures } from './textureEstimate';

export const APP_VERSION = '0.2.0';
export const MANUAL_WINDOW_MS = 5000;

const MAX_COMPLETED_WINDOWS = 40;
const MAX_LIFECYCLE_EVENTS = 200;
/** Fallback close for fixed windows in case no frames render at all. */
/** Safety backstop for open-ended windows (automatic drag). */
const OPEN_WINDOW_SAFETY_MS = 30_000;

type LifecycleListener = () => void;

export class DeviceQa {
  private renderer: THREE.WebGLRenderer | null = null;
  private windows = new Map<string, { window: FrameWindow; fallback: number }>();
  private completed: FrameWindowStats[] = [];
  private lifecycle: LifecycleEventRecord[] = [];
  private listeners = new Set<LifecycleListener>();
  private revision = 0;
  checkpoint = '';

  subscribe = (listener: LifecycleListener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private notify() { this.revision += 1; this.listeners.forEach((listener) => listener()); }
  getRevision = () => this.revision;

  registerRenderer = (renderer: THREE.WebGLRenderer | null) => { this.renderer = renderer; };

  record = (kind: string, detail?: string) => {
    this.lifecycle.push({ at: Date.now(), kind, ...(detail ? { detail } : {}) });
    if (this.lifecycle.length > MAX_LIFECYCLE_EVENTS) this.lifecycle.splice(0, this.lifecycle.length - MAX_LIFECYCLE_EVENTS);
    this.notify();
  };

  /** Opens a pacing window. Fixed-duration windows close on a wall-clock timer at EXACTLY the requested duration — closing never requests or invalidates a render, and observed frame intervals remain useFrame-only. Open-ended windows (automatic drag) close on session-mode transitions with the safety timer as backstop. */

  beginWindow = (label: string, fixedDurationMs?: number) => {
    if (!isDeviceQaEnabled || this.windows.has(label)) return;
    const frameWindow = new FrameWindow(label, performance.now(), fixedDurationMs);
    const fallback = setTimeout(() => this.endWindow(label), fixedDurationMs ?? OPEN_WINDOW_SAFETY_MS) as unknown as number;
    this.windows.set(label, { window: frameWindow, fallback });
    this.record('window-open', label);
    this.notify();
  };

  endWindow = (label: string) => {
    const active = this.windows.get(label);
    if (!active) return;
    this.windows.delete(label);
    clearTimeout(active.fallback);
    this.completed.push(active.window.close(performance.now()));
    if (this.completed.length > MAX_COMPLETED_WINDOWS) this.completed.splice(0, this.completed.length - MAX_COMPLETED_WINDOWS);
    this.record('window-close', label);
    this.notify();
  };

  activeLabels = (): string[] => [...this.windows.keys()];
  completedWindows = (): readonly FrameWindowStats[] => this.completed;
  lifecycleEvents = (): readonly LifecycleEventRecord[] => this.lifecycle;

  /** Called once per actually rendered frame by the scene bridge. */
  observeFrame = (now: number) => {
    for (const [label, active] of this.windows) {
      if (active.window.observe(now)) this.endWindow(label);
    }
  };
  private webglIdentity(): { vendor?: string; renderer?: string } {
    if (!this.renderer) return {};
    try {
      const context = this.renderer.getContext();
      const extension = context.getExtension('WEBGL_debug_renderer_info');
      return {
        vendor: String(extension ? context.getParameter(extension.UNMASKED_VENDOR_WEBGL) : context.getParameter(context.VENDOR)),
        renderer: String(extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER)),
      };
    } catch { return {}; }
  }

  private rendererSnapshot(): RendererSnapshot | null {
    if (!this.renderer) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      frameloop: 'demand',
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      textures: this.renderer.info.memory.textures,
      geometries: this.renderer.info.memory.geometries,
      dpr: this.renderer.getPixelRatio(),
      canvasCssSize: rect.width > 0 ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
    };
  }

  buildReport(): DeviceReportInput {
    const telegram = getTelegramSnapshot();
    const cacheDiagnostics = assetCache.diagnostics();
    const scans = cacheDiagnostics.assets
      .filter((entry) => entry.status === 'ready')
      .map((entry) => assetCache.get(entry.assetId)?.value)
      .flatMap((value) => value ? [scanSceneTextures(value.assetId, value.scene)] : []);
    const texture = aggregateTextureEstimate(scans);
    return assembleReport({
      checkpoint: this.checkpoint,
      environment: {
        appVersion: APP_VERSION,
        mode: import.meta.env.MODE,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
          ...(window.visualViewport?.scale !== undefined ? { visualViewportScale: window.visualViewport.scale } : {}),
        },
        maxTouchPoints: navigator.maxTouchPoints,
        userAgent: navigator.userAgent,
        documentVisibility: document.visibilityState,
        telegram: {
          insideTelegram: telegram.insideTelegram,
          ...(telegram.platform !== undefined ? { platform: telegram.platform } : {}),
          ...(telegram.version !== undefined ? { version: telegram.version } : {}),
          ...(telegram.isActive !== undefined ? { isActive: telegram.isActive } : {}),
          ...(telegram.isExpanded !== undefined ? { isExpanded: telegram.isExpanded } : {}),
          ...(telegram.viewportHeight !== undefined ? { viewportHeight: telegram.viewportHeight } : {}),
          ...(telegram.viewportStableHeight !== undefined ? { viewportStableHeight: telegram.viewportStableHeight } : {}),
          ...(telegram.isFullscreen !== undefined ? { isFullscreen: telegram.isFullscreen } : {}),
          ...(telegram.safeAreaInset !== undefined ? { safeAreaInset: telegram.safeAreaInset } : {}),
          ...(telegram.contentSafeAreaInset !== undefined ? { contentSafeAreaInset: telegram.contentSafeAreaInset } : {}),
        },
        webgl: this.webglIdentity(),
      },
      renderer: this.rendererSnapshot(),
      assets: {
        loadedAssets: cacheDiagnostics.loadedAssets,
        totalKnownBytes: cacheDiagnostics.byteSize,
        entries: cacheDiagnostics.assets.map((entry) => ({ ...entry })),
        loadFailures: cacheDiagnostics.assets.filter((entry) => entry.status === 'error').map((entry) => ({ ...entry })),
      },
      textureMemory: texture.memory,
      textureDetails: texture.details,
      activeWindows: this.activeLabels(),
      completedWindows: [...this.completed],
      lifecycle: [...this.lifecycle],
    }) as DeviceReportInput;
  }

  reportJson = () => JSON.stringify(this.buildReport(), null, 2);
}

export const deviceQa = new DeviceQa();

/** Installs document/Telegram lifecycle observers for the device QA session.
 *  No-op outside device QA mode. Observational only: nothing here changes app
 *  or rendering behavior, and context loss is logged without preventDefault()
 *  so the natural WebView behavior stays visible. */
export const installDeviceQaObservers = (): (() => void) => {
  if (!isDeviceQaEnabled) return () => undefined;
  const onVisibility = () => deviceQa.record('visibilitychange', document.visibilityState);
  const onPageHide = () => deviceQa.record('pagehide');
  const onPageShow = () => deviceQa.record('pageshow');
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  const unsubscribeTelegram = subscribeTelegramLifecycle((event) => deviceQa.record(event));
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    unsubscribeTelegram();
  };
};

/** Automatic drag pacing window driven by editor session mode transitions:
 *  dragging → open, any other mode → close. Manual chips cannot be tapped
 *  while a finger drags an object, so drag must be captured automatically.
 *  The recorder only observes renders; it never invalidates frames itself. */
export const installDragPacingObserver = (): (() => void) => {
  if (!isDeviceQaEnabled) return () => undefined;
  let wasDragging = useEditorStore.getState().session.mode === 'dragging';
  return useEditorStore.subscribe((state) => {
    const dragging = state.session.mode === 'dragging';
    if (dragging === wasDragging) return;
    wasDragging = dragging;
    if (dragging) deviceQa.beginWindow('drag');
    else deviceQa.endWindow('drag');
  });
};
