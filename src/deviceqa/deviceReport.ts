import type { FrameWindowStats } from './framePacing';
import type { TelegramInsets } from '@/platform/telegram/types';
import type { RenderingLifecycleSnapshot } from '@/scene/lighting/renderingLifecycleDiagnostics';

/** p50/p95/worst describe intervals BETWEEN rendered frames while a captured
 *  interaction runs (demand frameloop). They are NOT GPU render durations and
 *  NOT idle FPS. Exported inside every report so numbers stay interpretable
 *  outside the codebase. */
export const PACING_NOTE =
  'p50/p95/worst are intervals between rendered frames during captured interactions (demand frameloop); not GPU render durations and not idle FPS';

export interface TextureMemoryEstimate {
  /** Always 'estimate': this is a heuristic, never measured GPU memory. */
  kind: 'estimate';
  bytes: number;
  method: string;
  coverage: string;
  textures: number;
}

export interface TextureDetail {
  assetId: string;
  textureName: string;
  width: number | null;
  height: number | null;
}

export type AssetStatus = 'loading' | 'ready' | 'error';

export interface AssetEntryReport {
  assetId: string;
  status: AssetStatus;
  byteSize: number;
}

export interface RendererSnapshot {
  frameloop: 'demand';
  calls: number;
  triangles: number;
  /** Authoritative texture COUNT from renderer.info.memory. */
  textures: number;
  geometries: number;
  /** Compiled WebGL program count when Three exposes renderer.info.programs. */
  programs: number | null;
  dpr: number;
  canvasCssSize: { width: number; height: number } | null;
}

export interface EnvironmentReport {
  appVersion: string;
  mode: string;
  viewport: { width: number; height: number; dpr: number; visualViewportScale?: number };
  maxTouchPoints: number;
  userAgent?: string;
  documentVisibility: string;
  telegram: {
    insideTelegram: boolean;
    platform?: string;
    version?: string;
    isActive?: boolean;
    isExpanded?: boolean;
    viewportHeight?: number;
    viewportStableHeight?: number;
    isFullscreen?: boolean;
    safeAreaInset?: TelegramInsets;
    contentSafeAreaInset?: TelegramInsets;
  };
  webgl: { vendor?: string; renderer?: string };
}

export interface LifecycleEventRecord {
  at: number;
  kind: string;
  detail?: string;
}

export interface DeviceReportInput {
  checkpoint: string;
  environment: EnvironmentReport;
  renderer: RendererSnapshot | null;
  renderingLifecycle: RenderingLifecycleSnapshot | null;
  assets: {
    loadedAssets: number;
    totalKnownBytes: number;
    entries: AssetEntryReport[];
    loadFailures: AssetEntryReport[];
  };
  textureMemory: TextureMemoryEstimate;
  textureDetails: TextureDetail[];
  activeWindows: string[];
  completedWindows: FrameWindowStats[];
  lifecycle: LifecycleEventRecord[];
}

/** Wraps collected inputs into an immutable, self-describing report.
 *  `capturedAt` is injectable for deterministic tests. */
export const assembleReport = (input: DeviceReportInput, capturedAt = Date.now()) => ({
  schema: 'interior-magic.device-report/1',
  capturedAt,
  pacingNote: PACING_NOTE,
  ...input,
});
