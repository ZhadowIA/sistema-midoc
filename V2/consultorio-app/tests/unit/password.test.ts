import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { hashPassword, passwordNeedsRehash, verifyPassword } from "../../src/lib/security/password";

const scrypt = promisify(scryptCallback);

// Reproduce el formato legado `scrypt$salt$hash` (parametros por defecto de
// Node: N=16384) para verificar compatibilidad hacia atras.
async function legacyHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

describe("hashPassword / verifyPassword", () => {
  it("produces a self-describing hash with OWASP-level cost params and round-trips", async () => {
    const stored = await hashPassword("correct horse battery staple");

    const parts = stored.split("$");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(Number(parts[1])).toBeGreaterThanOrEqual(131072); // N >= 2^17
    expect(Number(parts[2])).toBeGreaterThanOrEqual(8); // r
    expect(Number(parts[3])).toBeGreaterThanOrEqual(1); // p

    await expect(verifyPassword("correct horse battery staple", stored)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", stored)).resolves.toBe(false);
  });

  it("still verifies legacy hashes without stored params", async () => {
    const stored = await legacyHash("mi-clave-antigua");

    await expect(verifyPassword("mi-clave-antigua", stored)).resolves.toBe(true);
    await expect(verifyPassword("otra-clave", stored)).resolves.toBe(false);
  });

  it("rejects malformed stored hashes without throwing", async () => {
    await expect(verifyPassword("x", "")).resolves.toBe(false);
    await expect(verifyPassword("x", "bcrypt$a$b")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt$noesnumero$8$1$salt$hash")).resolves.toBe(false);
  });
});

describe("passwordNeedsRehash", () => {
  it("flags legacy hashes and hashes below current params", async () => {
    expect(passwordNeedsRehash(await legacyHash("clave"))).toBe(true);
    expect(passwordNeedsRehash("scrypt$16384$8$1$salt$hash")).toBe(true);
  });

  it("does not flag hashes produced with current params", async () => {
    expect(passwordNeedsRehash(await hashPassword("clave"))).toBe(false);
  });
});
