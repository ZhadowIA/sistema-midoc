import assert from "node:assert/strict";
import {
  clearAuthFailures,
  getAuthLockoutStatus,
  recordAuthFailure,
} from "../../lib/authLockout.ts";
import { resetSecurityStateStore } from "../../lib/securityStateStore.ts";
import { runSuite } from "../testHarness.ts";

export async function runAuthLockoutUnitTests() {
  await runSuite("Unit: auth lockout", [
    {
      name: "recordAuthFailure locks account after threshold",
      run: async () => {
        await resetSecurityStateStore();
        const now = 1_000;

        for (let index = 0; index < 5; index += 1) {
          await recordAuthFailure("doctor-login", "demo@midoc.test", now + index);
        }

        const status = await getAuthLockoutStatus("doctor-login", "demo@midoc.test", now + 10);
        assert.equal(status.locked, true);
        assert.equal(status.failedAttempts, 5);
        assert.ok(status.remainingMs > 0);
      },
    },
    {
      name: "clearAuthFailures removes lockout bucket",
      run: async () => {
        await resetSecurityStateStore();
        await recordAuthFailure("doctor-login", "demo@midoc.test", 1_000);
        await clearAuthFailures("doctor-login", "demo@midoc.test");

        const status = await getAuthLockoutStatus("doctor-login", "demo@midoc.test", 2_000);
        assert.deepEqual(status, { locked: false, remainingMs: 0, failedAttempts: 0 });
      },
    },
  ]);
}
