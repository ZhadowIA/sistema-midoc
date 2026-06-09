import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { getServerEnv } from "@/lib/env";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_ALLOWED_WINDOW = 1;
const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 10 * 60;

const env = getServerEnv();
const jwtSecret = new TextEncoder().encode(env.NEXTAUTH_SECRET);

export function roleSupportsTwoFactor(role: string) {
  return role === "ADMIN" || role === "CLINIC_ADMIN";
}

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function deriveEncryptionKey() {
  return createHash("sha256").update(`${env.NEXTAUTH_SECRET}:two-factor`).digest();
}

function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
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

function base32Decode(input: string) {
  const normalized = input.toUpperCase().replace(/=+$/g, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function normalizeTotpCode(code: string) {
  return code.replace(/\s+/g, "").trim();
}

function normalizeRecoveryCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateHotp(secret: string, counter: number) {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function generateTwoFactorSecret() {
  return base32Encode(randomBytes(20));
}

export function buildTotpUri(input: { secret: string; accountName: string; issuer?: string }) {
  const issuer = input.issuer ?? "MiDoc";
  const label = encodeURIComponent(`${issuer}:${input.accountName}`);
  const query = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

export function verifyTotpCode(secret: string, code: string, nowMs = Date.now()) {
  const normalized = normalizeTotpCode(code);
  if (!/^\d{6}$/.test(normalized)) return false;

  const counter = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  const provided = Buffer.from(normalized, "utf8");

  for (let delta = -TOTP_ALLOWED_WINDOW; delta <= TOTP_ALLOWED_WINDOW; delta += 1) {
    const expected = Buffer.from(generateHotp(secret, counter + delta), "utf8");
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return true;
    }
  }

  return false;
}

export function encryptTwoFactorSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptTwoFactorSecret(payload: string) {
  const data = Buffer.from(payload, "base64url");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export async function createTwoFactorChallengeToken(input: { userId: string; role: string }) {
  return new SignJWT({
    sub: input.userId,
    role: input.role,
    purpose: "2fa-login",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${TWO_FACTOR_CHALLENGE_TTL_SECONDS}s`)
    .sign(jwtSecret);
}

export async function verifyTwoFactorChallengeToken(token: string) {
  const { payload } = await jwtVerify(token, jwtSecret);
  if (payload.purpose !== "2fa-login") {
    throw new Error("Challenge inválido");
  }
  if (typeof payload.sub !== "string" || typeof payload.role !== "string") {
    throw new Error("Challenge inválido");
  }
  return {
    userId: payload.sub,
    role: payload.role,
  };
}

export function __generateTotpForTests(secret: string, nowMs: number) {
  const counter = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  return generateHotp(secret, counter);
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

export function hashRecoveryCode(code: string) {
  return sha256(normalizeRecoveryCode(code));
}

export function hashRecoveryCodes(codes: string[]) {
  return codes.map(hashRecoveryCode);
}

export function consumeRecoveryCode(code: string, hashedCodes: string[]) {
  const candidate = Buffer.from(hashRecoveryCode(code), "utf8");
  const next: string[] = [];
  let matched = false;

  for (const entry of hashedCodes) {
    const hashed = Buffer.from(entry, "utf8");
    const equal = hashed.length === candidate.length && timingSafeEqual(hashed, candidate);
    if (!matched && equal) {
      matched = true;
      continue;
    }
    next.push(entry);
  }

  return {
    matched,
    remaining: next,
  };
}
