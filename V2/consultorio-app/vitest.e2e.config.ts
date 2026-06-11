import { defineConfig } from "vitest/config";

// Live-server E2E suite (paso 9). Boots `next dev` once and hits it over HTTP,
// so it needs generous timeouts and must not run files in parallel.
export default defineConfig({
  test: {
    setupFiles: ["./tests/setup-env.ts"],
    include: ["tests/e2e/**/*.e2e.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false
  }
});
