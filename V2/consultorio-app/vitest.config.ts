import { configDefaults, defineConfig } from "vitest/config";

// Default test run (unit + integration + smoke). The live-server E2E suite is
// excluded here because it boots `next dev`; run it explicitly via `test:e2e`.
export default defineConfig({
  test: {
    setupFiles: ["./tests/setup-env.ts"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    // The integration suite shares one PostgreSQL database and exercises global
    // maintenance operations (e.g. runPilotCleanup, lazy hold expiry). Running
    // files in parallel races on that shared state, so they must see one flow at
    // a time — same rationale as the E2E config.
    fileParallelism: false
  }
});
