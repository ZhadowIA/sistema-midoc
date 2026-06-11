import { defineConfig } from "vitest/config";

// Live-server E2E suite (paso 9). A global setup boots one `next dev` shared by
// every E2E file; tests hit it over HTTP. Generous timeouts; no file parallelism
// so the shared server and database see one flow at a time.
export default defineConfig({
  test: {
    globalSetup: ["./tests/e2e/global-server.ts"],
    setupFiles: ["./tests/setup-env.ts"],
    include: ["tests/e2e/**/*.e2e.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false
  }
});
