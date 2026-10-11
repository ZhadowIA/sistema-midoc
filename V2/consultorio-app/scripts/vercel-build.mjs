// Build del portal en Vercel (despliegue de pruebas, docs/DESPLIEGUE_PRUEBAS.md).
// En produccion (rama `dev`) aplica las migraciones antes de construir, por la
// conexion directa de Neon: el pooler (PgBouncer en modo transaccion) no sirve
// para `prisma migrate`. Las previews no migran: Vercel solo despliega `dev`.
import { execSync } from "node:child_process";

function run(command, extraEnv = {}) {
  execSync(command, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

if (process.env.VERCEL_ENV === "production") {
  const direct = process.env.DIRECT_DATABASE_URL;
  if (!direct) {
    throw new Error("Falta DIRECT_DATABASE_URL (conexion directa de Neon) para aplicar las migraciones.");
  }
  run("npx prisma migrate deploy", { DATABASE_URL: direct });
}

run("npx prisma generate");
run("npx next build");
