import { defineConfig, mergeConfig } from "vitest/config";

import base from "./vitest.config";

/**
 * Pruebas de integracion contra PostgreSQL. **Sin paralelismo de archivos**: la
 * suite comparte una sola base y ejercita operaciones globales (limpieza de
 * mantenimiento, expiracion perezosa de holds), asi que dos archivos a la vez
 * se pisan — un test de reservas puede expirar el hold que otro esta contando.
 * Requiere el esquema aplicado (`npm run db:migrate:deploy`).
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["tests/integration/**/*.test.ts"],
      fileParallelism: false
    }
  })
);
