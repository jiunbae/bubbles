/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Disabled by default. Enable only after integrating a Google-certified CMP. */
  readonly VITE_ADSENSE_ENABLED?: 'true' | 'false';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
