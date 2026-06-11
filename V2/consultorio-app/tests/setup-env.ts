import { loadTestEnv } from "./load-test-env";

// Vitest setupFile: runs before each test module evaluates, so configuration
// validated at import time (src/lib/env.ts) sees a complete environment.
loadTestEnv();
