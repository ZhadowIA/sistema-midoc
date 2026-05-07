import assert from "node:assert/strict";
import {
  __generateTotpForTests,
  buildTotpUri,
  consumeRecoveryCode,
  createTwoFactorChallengeToken,
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
  generateRecoveryCodes,
  generateTwoFactorSecret,
  hashRecoveryCodes,
  verifyTotpCode,
  verifyTwoFactorChallengeToken,
} from "../../lib/twoFactor.ts";
import { runSuite } from "../testHarness.ts";

export async function runTwoFactorUnitTests() {
  await runSuite("Unit: twoFactor", [
    {
      name: "encrypt/decrypt preserves secret",
      run: () => {
        const secret = generateTwoFactorSecret();
        const encrypted = encryptTwoFactorSecret(secret);
        assert.equal(decryptTwoFactorSecret(encrypted), secret);
      },
    },
    {
      name: "verifyTotpCode accepts valid current code",
      run: () => {
        const secret = "JBSWY3DPEHPK3PXP";
        const now = Date.UTC(2030, 0, 1, 0, 0, 0);
        const code = __generateTotpForTests(secret, now);
        assert.equal(verifyTotpCode(secret, code, now), true);
        assert.equal(verifyTotpCode(secret, "000000", now), false);
      },
    },
    {
      name: "buildTotpUri includes issuer and secret",
      run: () => {
        const uri = buildTotpUri({
          secret: "JBSWY3DPEHPK3PXP",
          accountName: "admin@midoc.test",
        });
        assert.equal(uri.startsWith("otpauth://totp/"), true);
        assert.equal(uri.includes("secret=JBSWY3DPEHPK3PXP"), true);
        assert.equal(uri.includes("issuer=MiDoc"), true);
      },
    },
    {
      name: "challenge token roundtrip preserves user and role",
      run: async () => {
        const token = await createTwoFactorChallengeToken({
          userId: "user_123",
          role: "ADMIN",
        });
        const payload = await verifyTwoFactorChallengeToken(token);
        assert.deepEqual(payload, { userId: "user_123", role: "ADMIN" });
      },
    },
    {
      name: "consumeRecoveryCode matches once and removes consumed code",
      run: () => {
        const recoveryCodes = generateRecoveryCodes(2);
        const hashed = hashRecoveryCodes(recoveryCodes);
        const first = consumeRecoveryCode(recoveryCodes[0], hashed);
        assert.equal(first.matched, true);
        assert.equal(first.remaining.length, 1);

        const second = consumeRecoveryCode(recoveryCodes[0], first.remaining);
        assert.equal(second.matched, false);
        assert.equal(second.remaining.length, 1);
      },
    },
  ]);
}
