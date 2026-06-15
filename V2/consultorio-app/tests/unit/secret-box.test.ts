import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "../../src/lib/security/secret-box";

describe("secret-box (AES-256-GCM en reposo)", () => {
  it("descifra lo que cifra y produce textos distintos por nonce", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);

    expect(a).not.toBe(b); // nonce aleatorio
    expect(decryptSecret(a)).toBe(plaintext);
    expect(decryptSecret(b)).toBe(plaintext);
  });

  it("falla la autenticacion si el ciphertext se altera", () => {
    const payload = encryptSecret("secreto");
    const tampered = Buffer.from(payload, "base64");
    tampered[tampered.length - 1] ^= 0x01;

    expect(() => decryptSecret(tampered.toString("base64"))).toThrow();
  });
});
