/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ITHAPPY_ASSET_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
