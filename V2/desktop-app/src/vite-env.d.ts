/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "on" enciende los modulos congelados por el reenfoque (agenda, recepcion, caja). */
  readonly VITE_MIDOC_FROZEN_SCOPE?: string;
  /** Portal con el que se vincula la app (p. ej. https://<proyecto>.vercel.app). */
  readonly VITE_MIDOC_PORTAL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
