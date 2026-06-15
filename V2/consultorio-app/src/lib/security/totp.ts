import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// TOTP/HOTP (RFC 6238 / RFC 4226) sobre el `crypto` nativo de Node: SHA-1, 6
// digitos, paso de 30s. Implementacion propia y auditable para no agregar una
// dependencia (regla 9); validada contra los vectores de prueba del RFC en pruebas.

const DIGITS = 6;
const STEP_SECONDS = 30;
const SECRET_BYTES = 20; // 160 bits, recomendado por RFC 4226.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Codifica bytes a base32 (RFC 4648) sin padding. */
export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/** Decodifica una cadena base32 (RFC 4648), tolerando minusculas y padding. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error("Caracter base32 invalido.");
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/** Genera un secreto TOTP nuevo en base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

function counterBuffer(counter: number): Buffer {
  const buf = Buffer.alloc(8);
  // Counter de 64 bits big-endian; usamos los 32 bits bajos (suficiente por siglos).
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  return buf;
}

/** HOTP (RFC 4226): codigo de 6 digitos para un secreto y contador. */
export function hotp(secret: Buffer, counter: number): string {
  const hmac = createHmac("sha1", secret).update(counterBuffer(counter)).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/** TOTP (RFC 6238): codigo para un secreto base32 en un instante (ms). */
export function totp(secretBase32: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

/**
 * Verifica un codigo TOTP con tolerancia de +/- `window` pasos (por reloj
 * desfasado). Comparacion en tiempo constante.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { window?: number; atMs?: number } = {}
): boolean {
  const window = options.window ?? 1;
  const atMs = options.atMs ?? Date.now();
  const normalized = code.replace(/\s/g, "");

  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  const secret = base32Decode(secretBase32);
  const baseCounter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const candidate = Buffer.from(normalized);

  for (let drift = -window; drift <= window; drift += 1) {
    const expected = Buffer.from(hotp(secret, baseCounter + drift));
    if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) {
      return true;
    }
  }

  return false;
}

/** URI otpauth:// para mostrar como QR en la app autenticadora. */
export function otpauthUri(secretBase32: string, accountLabel: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS)
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
