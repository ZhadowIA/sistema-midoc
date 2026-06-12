import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  totp,
  verifyTotp
} from "../../src/lib/security/totp";

// Semilla de los vectores de prueba del RFC 4226 / RFC 6238: ASCII "12345678901234567890".
const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_SECRET_B32 = base32Encode(RFC_SECRET);

describe("HOTP (RFC 4226 test vectors)", () => {
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489"
  ];

  it("matches the published 6-digit codes for counters 0..9", () => {
    expected.forEach((code, counter) => {
      expect(hotp(RFC_SECRET, counter)).toBe(code);
    });
  });
});

describe("TOTP (RFC 6238 test vectors, SHA1, 6 digits)", () => {
  // Cada vector: instante en segundos => ultimos 6 digitos del codigo de 8 publicado.
  const vectors: Array<[number, string]> = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"]
  ];

  it("matches the published codes at the reference instants", () => {
    for (const [seconds, code] of vectors) {
      expect(totp(RFC_SECRET_B32, seconds * 1000)).toBe(code);
    }
  });
});

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    const data = Buffer.from([0, 1, 2, 250, 251, 255, 42]);
    expect(base32Decode(base32Encode(data))).toEqual(data);
  });
});

describe("verifyTotp", () => {
  it("accepts the current code and tolerates +/- one step", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;

    expect(verifyTotp(secret, totp(secret, now), { atMs: now })).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 30_000), { atMs: now })).toBe(true);
    expect(verifyTotp(secret, totp(secret, now + 30_000), { atMs: now })).toBe(true);
  });

  it("rejects codes outside the window and malformed input", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;

    expect(verifyTotp(secret, totp(secret, now - 120_000), { atMs: now })).toBe(false);
    expect(verifyTotp(secret, "000", { atMs: now })).toBe(false);
    expect(verifyTotp(secret, "abcdef", { atMs: now })).toBe(false);
  });
});
