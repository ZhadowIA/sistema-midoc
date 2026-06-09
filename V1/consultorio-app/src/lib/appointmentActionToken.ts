import { SignJWT, jwtVerify } from 'jose'
import { getServerEnv } from './env'

const TOKEN_TTL = '7d'
const SCOPE = 'appointment-action' as const

export type AppointmentActionTokenPayload = {
  appointmentId: string
  scope: typeof SCOPE
}

function getSecret() {
  return new TextEncoder().encode(getServerEnv().NEXTAUTH_SECRET)
}

export async function signAppointmentActionToken(appointmentId: string): Promise<string> {
  return new SignJWT({ appointmentId, scope: SCOPE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecret())
}

export async function verifyAppointmentActionToken(token: string): Promise<AppointmentActionTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.scope !== SCOPE || typeof payload.appointmentId !== 'string') {
    throw new Error('Token inválido')
  }
  return { appointmentId: payload.appointmentId, scope: SCOPE }
}

/** Builds the action URL embedded in notification messages. */
export function buildCitaUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/cita/${token}`
}

/**
 * Marker embedded in notification message text.
 * Each dispatcher (SMS/Email) renders it differently.
 */
export function buildActionMarker(token: string): string {
  return `[CITA_ACTIONS:${token}]`
}

export function extractActionToken(message: string): string | null {
  const match = /\[CITA_ACTIONS:([^\]]+)\]/.exec(message)
  return match ? match[1] : null
}

export function stripActionMarker(message: string): string {
  return message.replace(/\n?\[CITA_ACTIONS:[^\]]+\]/g, '').trim()
}
