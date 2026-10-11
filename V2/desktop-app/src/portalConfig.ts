// URL del portal con el que la app se vincula. Se fija al compilar con
// VITE_MIDOC_PORTAL_URL (p. ej. el despliegue de pruebas en Vercel); sin ella,
// el portal local de desarrollo. Puro para probarlo con `node --test`; la
// lectura de la variable vive en `App.tsx`.

export const DEFAULT_PORTAL_URL = "http://localhost:3000";

export function parsePortalUrl(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return DEFAULT_PORTAL_URL;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_PORTAL_URL;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_PORTAL_URL;
  }
}
