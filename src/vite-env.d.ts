/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY: string
  readonly VITE_KIE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
