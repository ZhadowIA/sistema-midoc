import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import prisma from './prisma'
import { getServerEnv } from './env'

const secret = new TextEncoder().encode(getServerEnv().NEXTAUTH_SECRET)

export type AuthenticatedRole = 'DOCTOR' | 'ADMIN' | 'CLINIC_ADMIN' | 'PATIENT' | 'SECRETARY'

export type AuthenticatedUser = {
  id: string
  role: AuthenticatedRole
  bossId?: string | null
  productPlan?: 'AGENDA' | 'CLINICAL_RECORDS' | 'COMBINED'
  enabledModules?: Array<'AGENDA' | 'CLINICAL_RECORDS'>
  features?: Record<string, unknown>
  twoFactorVerified?: boolean
  twoFactorSetupRequired?: boolean
}

function coerceFeatures(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('med_token')?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.sub
    const role = payload.role
    const jti = payload.jti

    if (typeof userId !== 'string' || typeof role !== 'string') {
      return null
    }

    if (typeof jti === 'string') {
      const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { jti }, select: { jti: true } })
      if (blacklisted) return null
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, active: true, bossId: true },
    })

    if (!user || !user.active) return null

    if (user.role !== role) return null

    return {
      id: user.id,
      role: user.role as AuthenticatedRole,
      bossId: user.bossId,
      productPlan:
        payload.productPlan === 'AGENDA' ||
        payload.productPlan === 'CLINICAL_RECORDS' ||
        payload.productPlan === 'COMBINED'
          ? payload.productPlan
          : undefined,
      enabledModules: Array.isArray(payload.enabledModules)
        ? payload.enabledModules.filter(
            (item): item is 'AGENDA' | 'CLINICAL_RECORDS' =>
              item === 'AGENDA' || item === 'CLINICAL_RECORDS'
          )
        : undefined,
      features: coerceFeatures(payload.features),
      twoFactorVerified: payload.twoFactorVerified === true,
      twoFactorSetupRequired: payload.twoFactorSetupRequired === true,
    }
  } catch {
    return null
  }
}

export async function getAuthenticatedDoctorId(): Promise<string | null> {
  return getEffectiveDoctorId()
}

/**
 * Returns the doctor ID for the current context.
 * If the user is a DOCTOR, ADMIN or CLINIC_ADMIN, returns their ID.
 * If the user is a SECRETARY, returns their bossId.
 */
export async function getEffectiveDoctorId(): Promise<string | null> {
  const user = await getAuthenticatedUser()
  if (!user) return null

  if (user.role === 'DOCTOR' || user.role === 'ADMIN' || user.role === 'CLINIC_ADMIN') {
    return user.id
  }

  if (user.role === 'SECRETARY' && user.bossId) {
    return user.bossId
  }

  return null
}

export async function getAuthenticatedMedicalContext(options?: { allowSecretary?: boolean }) {
  const allowSecretary = options?.allowSecretary ?? false
  const user = await getAuthenticatedUser()
  if (!user) return null

  if (user.role === 'DOCTOR' || user.role === 'ADMIN' || user.role === 'CLINIC_ADMIN') {
    return {
      user,
      doctorId: user.id,
    }
  }

  if (allowSecretary && user.role === 'SECRETARY' && user.bossId) {
    return {
      user,
      doctorId: user.bossId,
    }
  }

  return null
}
