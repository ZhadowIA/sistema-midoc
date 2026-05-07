import { SignJWT, jwtVerify } from "jose";
import { getServerEnv } from "@/lib/env";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOADS_PER_APPOINTMENT = 5;
export const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];

type UploadTokenPayload = {
  appointmentId: string;
  doctorId: string;
  scope: "upload";
};

function getSecret() {
  const env = getServerEnv();
  const raw = process.env.APPOINTMENT_UPLOAD_TOKEN_SECRET || env.NEXTAUTH_SECRET;
  return new TextEncoder().encode(raw);
}

export async function signAppointmentUploadToken(payload: UploadTokenPayload, expiresIn = "24h") {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function verifyAppointmentUploadToken(token: string): Promise<UploadTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  if (payload.scope !== "upload" || !payload.appointmentId || !payload.doctorId) {
    throw new Error("Token inválido");
  }
  return payload as unknown as UploadTokenPayload;
}

// Magic-bytes signatures for each allowed MIME type.
// Validates actual file content, not just the client-declared type.
const MAGIC_BYTES: Record<string, (b: Uint8Array) => boolean> = {
  "application/pdf": (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  "image/png": (b) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8,
};

export function validateFileMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  const validator = MAGIC_BYTES[mimeType];
  if (!validator || bytes.length < 8) return false;
  return validator(bytes);
}
