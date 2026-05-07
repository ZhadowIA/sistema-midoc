import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { toLocalDateKey } from '@/lib/dateTime'
import { attachSessionCookie, buildSessionToken } from '@/lib/session'
import { captureError, emitMetric, logEvent } from '@/lib/observability'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'
import {
  authLockedResponseBody,
  clearAuthFailures,
  getAuthLockoutStatus,
  recordAuthFailure,
} from '@/lib/authLockout'

const loginPatientSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

const PATIENT_LOGIN_RATE_LIMIT = { key: 'auth:patient:login', limit: 5, windowMs: 15 * 60 * 1000 }

export async function POST(request: Request) {
  try {
    const parsed = loginPatientSchema.parse(await request.json())
    const email = parsed.email.trim().toLowerCase()
    const password = parsed.password

    const limit = await checkRateLimit(request, { ...PATIENT_LOGIN_RATE_LIMIT, identifier: email })
    if (!limit.ok) {
      logEvent('warn', 'auth.patient.login.rate_limited', { email })
      emitMetric({ domain: 'auth', metric: 'patient_login_rate_limited' })
      return rateLimitExceededResponse(limit)
    }

    const lockout = await getAuthLockoutStatus('patient-login', email)
    if (lockout.locked) {
      logEvent('warn', 'auth.patient.login.locked', { email, failedAttempts: lockout.failedAttempts })
      emitMetric({ domain: 'auth', metric: 'patient_login_locked' })
      return NextResponse.json(authLockedResponseBody(lockout), {
        status: 423,
        headers: { 'Retry-After': String(Math.ceil(lockout.remainingMs / 1000)) },
      })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        passwordHash: true,
      },
    })

    if (!user || !user.active || user.role !== 'PATIENT') {
      logEvent('warn', 'auth.patient.login.failed', { email, reason: 'unknown_user' })
      emitMetric({ domain: 'auth', metric: 'patient_login_failed', tags: { reason: 'unknown_user' } })
      await recordAuthFailure('patient-login', email)
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash)
    if (!validPassword) {
      logEvent('warn', 'auth.patient.login.failed', { userId: user.id, reason: 'bad_password' })
      emitMetric({ domain: 'auth', metric: 'patient_login_failed', tags: { reason: 'bad_password' } })
      await recordAuthFailure('patient-login', email)
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    await clearAuthFailures('patient-login', email)

    const token = await buildSessionToken({ sub: user.id, role: user.role })

    const latestPatient = await prisma.patient.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastNamePaternal: true,
        lastNameMaternal: true,
        phone: true,
        email: true,
        dateOfBirth: true,
      },
    })

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      profile: latestPatient
        ? {
            id: latestPatient.id,
            firstName: latestPatient.firstName,
            lastNamePaternal: latestPatient.lastNamePaternal,
            lastNameMaternal: latestPatient.lastNameMaternal,
            phone: latestPatient.phone,
            email: latestPatient.email,
            dateOfBirth: toLocalDateKey(latestPatient.dateOfBirth),
          }
        : null,
    })

    attachSessionCookie(response, token)
    logEvent('info', 'auth.patient.login.success', { userId: user.id })
    emitMetric({ domain: 'auth', metric: 'patient_login_success' })

    return response
  } catch (error: unknown) {
    captureError('auth.patient.login.error', error)
    emitMetric({ domain: 'auth', metric: 'patient_login_error' })
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
