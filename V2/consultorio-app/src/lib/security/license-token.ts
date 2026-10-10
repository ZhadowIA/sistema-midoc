import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { z } from "zod";

/**
 * Licencia de compra unica firmada (paso 29). Formato:
 * `base64url(payload JSON) "." base64url(firma Ed25519 de esos mismos bytes)`.
 * Se firman los bytes exactos del payload, sin canonicalizar: quien verifica
 * no tiene que reconstruir el JSON. La app del medico la verifica sin red con
 * las llaves publicas que trae fijadas (`MIDOC_LICENSE_PUBKEYS`).
 *
 * OPERATIVO: identifica la cuenta, el medico y el equipo; nunca contenido clinico.
 */

export const LICENSE_TOKEN_VERSION = 1;

export const licensePayloadSchema = z.object({
  v: z.literal(LICENSE_TOKEN_VERSION),
  kid: z.string().min(1).max(64),
  licenseId: z.string().min(1),
  activationId: z.string().min(1),
  accountId: z.string().min(1),
  holderName: z.string().nullable(),
  holderLicenseNumber: z.string().nullable(),
  edition: z.string().min(1),
  // Fechas de calendario (AAAA-MM-DD) e instante de emision en UTC.
  purchasedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  updatesUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxDevices: z.number().int().positive(),
  installationId: z.string().uuid(),
  issuedAt: z.string().datetime()
});

export type LicensePayload = z.infer<typeof licensePayloadSchema>;

export interface LicenseSigningKey {
  kid: string;
  privateKey: KeyObject;
}

// Prefijo DER de una llave privada Ed25519 en PKCS#8 (RFC 8410) antes de la semilla.
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
// Prefijo DER de una llave publica Ed25519 en SubjectPublicKeyInfo antes de los 32 bytes.
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Llave de firma a partir de la semilla de 32 bytes en base64 (`LICENSE_SIGNING_KEY`). */
export function signingKeyFromSeed(kid: string, seedBase64: string): LicenseSigningKey {
  const seed = Buffer.from(seedBase64, "base64");
  if (seed.length !== 32) {
    throw new Error("La semilla Ed25519 debe tener 32 bytes.");
  }
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: "der",
    type: "pkcs8"
  });
  return { kid, privateKey };
}

/** Llave publica de 32 bytes en base64, la que se fija en la app. */
export function publicKeyBase64(key: LicenseSigningKey): string {
  const spki = createPublicKey(key.privateKey).export({ format: "der", type: "spki" });
  return spki.subarray(SPKI_ED25519_PREFIX.length).toString("base64");
}

export function publicKeyFromBase64(publicKey: string): KeyObject {
  const raw = Buffer.from(publicKey, "base64");
  if (raw.length !== 32) {
    throw new Error("La llave publica Ed25519 debe tener 32 bytes.");
  }
  return createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: "der", type: "spki" });
}

/** Par nuevo para `npm run license:keygen` y para pruebas. */
export function generateSigningSeed(): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  const der = privateKey.export({ format: "der", type: "pkcs8" });
  return der.subarray(PKCS8_ED25519_PREFIX.length).toString("base64");
}

export function signLicense(payload: LicensePayload, key: LicenseSigningKey): string {
  if (payload.kid !== key.kid) {
    throw new Error("El kid del payload no coincide con la llave de firma.");
  }
  const body = Buffer.from(JSON.stringify(licensePayloadSchema.parse(payload)), "utf8");
  const signature = sign(null, body, key.privateKey);
  return `${body.toString("base64url")}.${signature.toString("base64url")}`;
}

/**
 * Verifica firma y forma. `publicKeys` mapea `kid` a llave publica en base64.
 * Lanza si la licencia no es valida; no revisa a que equipo pertenece (eso lo
 * decide quien la usa).
 */
export function verifyLicense(token: string, publicKeys: Record<string, string>): LicensePayload {
  const parts = token.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Licencia con formato invalido.");
  }
  const body = Buffer.from(parts[0], "base64url");
  const signature = Buffer.from(parts[1], "base64url");

  let unverified: unknown;
  try {
    unverified = JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("Licencia con formato invalido.");
  }
  // Antes de verificar solo se lee el kid, para elegir la llave.
  const kid = typeof unverified === "object" && unverified !== null ? (unverified as { kid?: unknown }).kid : undefined;
  const publicKey = typeof kid === "string" ? publicKeys[kid] : undefined;
  if (!publicKey) {
    throw new Error("Licencia firmada con una llave desconocida.");
  }
  if (!verify(null, body, publicKeyFromBase64(publicKey), signature)) {
    throw new Error("La firma de la licencia no es valida.");
  }
  return licensePayloadSchema.parse(unverified);
}
