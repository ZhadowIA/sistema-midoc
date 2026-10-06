/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "on" enciende los modulos congelados por el reenfoque (agenda, recepcion, caja). */
  readonly VITE_MIDOC_FROZEN_SCOPE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
