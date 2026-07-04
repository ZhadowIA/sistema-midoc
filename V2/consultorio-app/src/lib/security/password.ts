import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

// promisify() pierde el overload con opciones de scrypt; se envuelve a mano.
function scrypt(
  password: string,
  salt: string,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

// Parametros explicitos siguiendo la recomendacion OWASP para scrypt
// (N=2^17, r=8, p=1). Van guardados en el hash (`scrypt$N$r$p$salt$hash`)
// para poder subirlos en el futuro sin romper hashes existentes.
const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

// Los hashes legados (`scrypt$salt$hash`) se derivaron con los parametros por
// defecto de Node; siguen verificando y se marcan para re-hash en el login.
const LEGACY_N = 16384;

function scryptOptions(N: number, r: number, p: number) {
  // maxmem debe cubrir 128*N*r bytes; el doble deja margen para overhead.
  return { N, r, p, maxmem: 256 * N * r };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, scryptOptions(SCRYPT_N, SCRYPT_R, SCRYPT_P));

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey.toString("hex")}`;
}

type ParsedHash = { N: number; r: number; p: number; salt: string; hash: string };

function parseStoredHash(storedHash: string): ParsedHash | null {
  const parts = storedHash.split("$");

  if (parts[0] !== "scrypt") {
    return null;
  }

  if (parts.length === 3) {
    const [, salt, hash] = parts;
    if (!salt || !hash) {
      return null;
    }
    return { N: LEGACY_N, r: 8, p: 1, salt, hash };
  }

  if (parts.length === 6) {
    const [, nRaw, rRaw, pRaw, salt, hash] = parts;
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || !salt || !hash) {
      return null;
    }
    return { N, r, p, salt, hash };
  }

  return null;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parsed = parseStoredHash(storedHash);

  if (!parsed) {
    return false;
  }

  let derivedKey: Buffer;
  try {
    derivedKey = await scrypt(password, parsed.salt, KEY_LENGTH, scryptOptions(parsed.N, parsed.r, parsed.p));
  } catch {
    return false;
  }

  const storedKey = Buffer.from(parsed.hash, "hex");

  if (derivedKey.length !== storedKey.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, storedKey);
}

/**
 * True si el hash almacenado es legado o usa parametros por debajo de los
 * actuales. Los flujos de login lo consultan tras verificar la contrasena
 * para re-hashear de forma transparente.
 */
export function passwordNeedsRehash(storedHash: string): boolean {
  const parsed = parseStoredHash(storedHash);

  if (!parsed) {
    return true;
  }

  return parsed.N < SCRYPT_N || parsed.r < SCRYPT_R || parsed.p < SCRYPT_P;
}
