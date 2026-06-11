import { configDefaults, defineConfig } from "vitest/config";

// Default test run (unit + integration + smoke). The live-server E2E suite is
// excluded here because it boots `next dev`; run it explicitly via `test:e2e`.
export default defineConfig({
  test: {
    setupFiles: ["./tests/setup-env.ts"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"]
  }
});
