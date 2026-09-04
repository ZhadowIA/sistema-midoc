import { defineConfig, mergeConfig } from "vitest/config";

import base from "./vitest.config";

/**
 * Pruebas unitarias y de humo: puras, sin base de datos. Corren en paralelo
 * porque no comparten estado — el motivo por el que en junio de 2026 hubo que
 * serializar la suite entera (carreras sobre la base compartida) no aplica
 * aqui, y serializarlas solo costaba tiempo.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["tests/unit/**/*.test.ts", "tests/smoke/**/*.test.ts"],
      fileParallelism: true
    }
  })
);
