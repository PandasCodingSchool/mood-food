/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string | undefined;
  // add more env variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
