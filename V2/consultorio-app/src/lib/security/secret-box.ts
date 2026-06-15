import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "../env";

// Cifrado simetrico autenticado (AES-256-GCM) para secretos en reposo del portal
// (p. ej. el secreto TOTP del 2FA). La llave se deriva a 32 bytes desde el env.
// No se usa para contenido clinico: eso vive en la app local cifrada del medico.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function encryptionKey(): Buffer {
  return createHash("sha256").update(env.TWO_FACTOR_ENCRYPTION_KEY).digest();
}

/** Cifra texto plano. Devuelve base64 de `iv | tag | ciphertext`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Descifra un payload producido por `encryptSecret`. Lanza si la autenticacion falla. */
export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
