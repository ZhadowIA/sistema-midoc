/**
 * Guarda comun de los scripts de desarrollo (`scripts/dev/*`, `scripts/seed-simple.ts`).
 * Estos scripts crean o borran cuentas con contrasenas conocidas: solo pueden
 * correr contra una base local y fuera de produccion (REGLAS §6: semillas solo
 * para desarrollo). Aborta antes de abrir la conexion si algo no cuadra.
 */
export function assertDevDatabase(scriptName: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${scriptName}: prohibido con NODE_ENV=production.`);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(`${scriptName}: falta DATABASE_URL (usa --env-file=.env.local).`);
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${scriptName}: DATABASE_URL no es una URL valida.`);
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!localHosts.has(host)) {
    throw new Error(
      `${scriptName}: solo corre contra una base local; DATABASE_URL apunta a "${host}".`
    );
  }
}

/** Lee una contrasena de una variable de entorno; nunca hay valor por defecto. */
export function requirePasswordFromEnv(variable: string, scriptName: string) {
  const value = process.env[variable];
  if (!value || value.length < 12) {
    throw new Error(
      `${scriptName}: define ${variable} (minimo 12 caracteres); no hay contrasena por defecto.`
    );
  }
  return value;
}
