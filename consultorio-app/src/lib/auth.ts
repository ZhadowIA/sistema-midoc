import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import prisma from './prisma'
import { getServerEnv } from './env'

const secret = new TextEncoder().encode(getServerEnv().NEXTAUTH_SECRET)
const doctorRoles = new Set(['DOCTOR', 'ADMIN'])

export type AuthenticatedRole = 'DOCTOR' | 'ADMIN' | 'PATIENT'

export type AuthenticatedUser = {
  id: string
  role: AuthenticatedRole
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('med_token')?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.sub
    const role = payload.role

    if (typeof userId !== 'string' || typeof role !== 'string') {
      return null
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, active: true },
    })

    if (!user || !user.active) return null

    if (user.role !== role) return null

    return {
      id: user.id,
      role: user.role as AuthenticatedRole,
    }
  } catch {
    return null
  }
}

export async function getAuthenticatedDoctorId(): Promise<string | null> {
  const user = await getAuthenticatedUser()
  if (!user) return null
  if (!doctorRoles.has(user.role)) {
    return null
  }

  return user.id
}
