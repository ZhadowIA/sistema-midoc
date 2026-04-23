import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { getDoctorSetupStatus } from '@/lib/setupStatus'
import { attachSessionCookie, buildSessionToken } from '@/lib/session'
import { captureError, logEvent } from '@/lib/observability'
import { getDoctorProductAccess } from '@/lib/productAccess'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'

const LOGIN_RATE_LIMIT = { key: 'auth:login', limit: 5, windowMs: 15 * 60 * 1000 }
const E2E_LOGIN_RATE_LIMIT = { key: 'auth:login:e2e', limit: 200, windowMs: 60 * 1000 }

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const loginRateLimit = process.env.E2E_TEST_MODE === '1' ? E2E_LOGIN_RATE_LIMIT : LOGIN_RATE_LIMIT

    const limit = checkRateLimit(request, {
      ...loginRateLimit,
      identifier: normalizedEmail || 'anon',
    })
    if (!limit.ok) {
      logEvent('warn', 'auth.login.rate_limited', { email: normalizedEmail })
      return rateLimitExceededResponse(limit)
    }

    // 1. Validate email
    const user = normalizedEmail
      ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
      : null
    if (!user || !user.active) {
      logEvent('warn', 'auth.login.failed', { email: normalizedEmail, reason: 'unknown_user' })
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    // 2. Verify password
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      logEvent('warn', 'auth.login.failed', { userId: user.id, reason: 'bad_password' })
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const setup = await getDoctorSetupStatus(user.id, user.role)
    const doctorIdForPlan = user.role === 'SECRETARY' ? user.bossId : user.id
    const productAccess = doctorIdForPlan
      ? await getDoctorProductAccess(doctorIdForPlan, user.role)
      : {
          plan: 'COMBINED' as const,
          enabledModules: ['AGENDA', 'CLINICAL_RECORDS'] as const,
          features: {
            'agenda.enabled': true,
            'clinical.enabled': true,
          },
        }

    // 3. Generate token
    const token = await buildSessionToken({
      sub: user.id,
      role: user.role,
      bossId: user.bossId ?? null,
      hasActiveSubscription: setup.hasActiveSubscription,
      onboardingCompleted: setup.onboardingCompleted,
      productPlan: productAccess.plan,
      enabledModules: [...productAccess.enabledModules],
      features: productAccess.features,
    })

    // 4. Set cookie
    const response = NextResponse.json({
      success: true,
      message: 'Autenticado',
      nextStep: setup.nextStep,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasActiveSubscription: setup.hasActiveSubscription,
        onboardingCompleted: setup.onboardingCompleted,
        productPlan: productAccess.plan,
        enabledModules: productAccess.enabledModules,
        features: productAccess.features,
      },
    })
    attachSessionCookie(response, token)
    logEvent('info', 'auth.login.success', {
      userId: user.id,
      role: user.role,
      nextStep: setup.nextStep,
    })

    return response
  } catch (error: unknown) {
    captureError('auth.login.error', error)

    if (
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientValidationError
    ) {
      const details = error.message.toLowerCase()
      if (details.includes('prisma://') || details.includes('datasource')) {
        return NextResponse.json(
          {
            error:
              'El servidor necesita reiniciarse para aplicar cambios de base de datos. Reinicia la app e intenta de nuevo.',
          },
          { status: 503 }
        )
      }

      return NextResponse.json(
        { error: 'No fue posible validar tu acceso por un problema temporal de base de datos.' },
        { status: 503 }
      )
    }

    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
