import { describe, expect, it } from "vitest";

import { addUtcMonths, toUtcCalendarDate } from "../../src/lib/dateTime";
import {
  generateSigningSeed,
  publicKeyBase64,
  signLicense,
  signingKeyFromSeed,
  verifyLicense,
  type LicensePayload
} from "../../src/lib/security/license-token";

function payload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    kid: "test-kid",
    licenseId: "lic_1",
    activationId: "act_1",
    accountId: "user_1",
    holderName: "Dra. Eva Soto",
    holderLicenseNumber: "1234567",
    edition: "STANDARD",
    purchasedAt: "2026-10-06",
    updatesUntil: "2027-10-06",
    maxDevices: 2,
    installationId: "8a33e6da-182a-475a-a41a-8b7c3d706990",
    issuedAt: "2026-10-06T18:00:00.000Z",
    ...overrides
  };
}

describe("license token (paso 29)", () => {
  const key = signingKeyFromSeed("test-kid", generateSigningSeed());
  const keys = { "test-kid": publicKeyBase64(key) };

  it("round-trips a signed license", () => {
    const token = signLicense(payload(), key);
    expect(token.split(".")).toHaveLength(2);
    expect(verifyLicense(token, keys)).toEqual(payload());
    expect(Buffer.from(publicKeyBase64(key), "base64")).toHaveLength(32);
  });

  it("rejects a tampered payload", () => {
    const [body, signature] = signLicense(payload(), key).split(".");
    const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    json.maxDevices = 99;
    const forged = `${Buffer.from(JSON.stringify(json)).toString("base64url")}.${signature}`;
    expect(() => verifyLicense(forged, keys)).toThrow(/firma/);
  });

  it("rejects unknown or wrong keys", () => {
    const token = signLicense(payload(), key);
    expect(() => verifyLicense(token, {})).toThrow(/desconocida/);
    const other = signingKeyFromSeed("test-kid", generateSigningSeed());
    expect(() => verifyLicense(token, { "test-kid": publicKeyBase64(other) })).toThrow(/firma/);
  });

  it("rejects malformed tokens and mismatched kids", () => {
    expect(() => verifyLicense("no-es-licencia", keys)).toThrow(/formato/);
    expect(() => verifyLicense("a.b.c", keys)).toThrow(/formato/);
    expect(() => signLicense(payload({ kid: "otra" }), key)).toThrow(/kid/);
    expect(() => signLicense(payload({ installationId: "no-uuid" }), key)).toThrow();
  });

  it("derives the same key from the same seed", () => {
    const seed = generateSigningSeed();
    expect(publicKeyBase64(signingKeyFromSeed("a", seed))).toBe(publicKeyBase64(signingKeyFromSeed("b", seed)));
    expect(() => signingKeyFromSeed("a", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("UTC calendar helpers", () => {
  it("adds months without overflowing the end of the month", () => {
    expect(toUtcCalendarDate(addUtcMonths(new Date("2026-10-06T18:00:00Z"), 12))).toBe("2027-10-06");
    expect(toUtcCalendarDate(addUtcMonths(new Date("2027-01-31T00:00:00Z"), 1))).toBe("2027-02-28");
    expect(toUtcCalendarDate(addUtcMonths(new Date("2028-01-31T00:00:00Z"), 1))).toBe("2028-02-29");
    expect(toUtcCalendarDate(addUtcMonths(new Date("2028-02-29T00:00:00Z"), 12))).toBe("2029-02-28");
  });
});
