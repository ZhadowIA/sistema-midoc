import { configDefaults, defineConfig } from "vitest/config";

/**
 * Configuracion base compartida. `vitest.unit.config.ts` y
 * `vitest.integration.config.ts` la extienden; la suite E2E vive aparte
 * (`vitest.e2e.config.ts`) porque levanta su propio `next dev`.
 *
 * Ejecutada sola (un `vitest` a secas) corre todo de forma secuencial, que es
 * el modo seguro: la suite de integracion comparte una sola base PostgreSQL.
 */
export default defineConfig({
  test: {
    setupFiles: ["./tests/setup-env.ts"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    fileParallelism: false
  }
});
