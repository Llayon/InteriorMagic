/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ITHAPPY_REMOTE_PREVIEW_ENABLED?: string;
  readonly VITE_ITHAPPY_ASSET_ORIGIN?: string;
  readonly VITE_ITHAPPY_PREVIEW_PLACEMENT_URL?: string;
  readonly VITE_PLANNING_INTENT_ENDPOINT?: string;
  readonly VITE_APP_API_ENDPOINT?: string;
  readonly VITE_AR0_ENABLED?: string;
  readonly VITE_AR_ASSET_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
