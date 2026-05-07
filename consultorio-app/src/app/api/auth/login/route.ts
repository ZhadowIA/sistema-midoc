import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { attachSessionCookie, buildSessionToken } from '@/lib/session'
import { captureError, logEvent } from '@/lib/observability'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'
import {
  authLockedResponseBody,
  clearAuthFailures,
  getAuthLockoutStatus,
  recordAuthFailure,
} from '@/lib/authLockout'
import { createTwoFactorChallengeToken, roleSupportsTwoFactor } from '@/lib/twoFactor'
import { buildMedicalSessionClaims } from '@/server/auth/medicalSession'
import { getTwoFactorCredential } from '@/server/security/twoFactorCredentialStore'

const LOGIN_RATE_LIMIT = { key: 'auth:login', limit: 5, windowMs: 15 * 60 * 1000 }
const E2E_LOGIN_RATE_LIMIT = { key: 'auth:login:e2e', limit: 200, windowMs: 60 * 1000 }

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const loginRateLimit = process.env.E2E_TEST_MODE === '1' ? E2E_LOGIN_RATE_LIMIT : LOGIN_RATE_LIMIT

    const limit = await checkRateLimit(request, {
      ...loginRateLimit,
      identifier: normalizedEmail || 'anon',
    })
    if (!limit.ok) {
      logEvent('warn', 'auth.login.rate_limited', { email: normalizedEmail })
      return rateLimitExceededResponse(limit)
    }

    const lockout = await getAuthLockoutStatus('doctor-login', normalizedEmail || 'anon')
    if (lockout.locked) {
      logEvent('warn', 'auth.login.locked', { email: normalizedEmail, failedAttempts: lockout.failedAttempts })
      return NextResponse.json(authLockedResponseBody(lockout), {
        status: 423,
        headers: { 'Retry-After': String(Math.ceil(lockout.remainingMs / 1000)) },
      })
    }

    // 1. Validate email
    const user = normalizedEmail
      ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
      : null
    if (!user || !user.active) {
      logEvent('warn', 'auth.login.failed', { email: normalizedEmail, reason: 'unknown_user' })
      await recordAuthFailure('doctor-login', normalizedEmail || 'anon')
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    // 2. Verify password
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      logEvent('warn', 'auth.login.failed', { userId: user.id, reason: 'bad_password' })
      await recordAuthFailure('doctor-login', normalizedEmail || user.id)
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    await clearAuthFailures('doctor-login', normalizedEmail || user.id)
    const twoFactorCredential = roleSupportsTwoFactor(user.role)
      ? await getTwoFactorCredential(user.id)
      : null

    if (roleSupportsTwoFactor(user.role) && twoFactorCredential?.enabled) {
      const challengeToken = await createTwoFactorChallengeToken({ userId: user.id, role: user.role })
      logEvent('info', 'auth.login.2fa_required', { userId: user.id, role: user.role })
      return NextResponse.json({
        requiresTwoFactor: true,
        challengeToken,
        user: {
          id: user.id,
          role: user.role,
          email: user.email,
        },
      })
    }

    const claims = await buildMedicalSessionClaims(user, {
      twoFactorVerified: roleSupportsTwoFactor(user.role) ? false : undefined,
      twoFactorSetupRequired: roleSupportsTwoFactor(user.role) && !twoFactorCredential?.enabled,
    })

    // 3. Generate token
    const token = await buildSessionToken(claims)

    // 4. Set cookie
    const response = NextResponse.json({
      success: true,
      message: 'Autenticado',
      nextStep: claims.hasActiveSubscription === false ? "SUBSCRIPTION" : claims.onboardingCompleted === false ? "ONBOARDING" : "DASHBOARD",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasActiveSubscription: claims.hasActiveSubscription,
        onboardingCompleted: claims.onboardingCompleted,
        productPlan: claims.productPlan,
        enabledModules: claims.enabledModules,
        features: claims.features,
        twoFactorSetupRequired: claims.twoFactorSetupRequired,
      },
    })
    attachSessionCookie(response, token)
    logEvent('info', 'auth.login.success', {
      userId: user.id,
      role: user.role,
      nextStep: claims.hasActiveSubscription === false ? "SUBSCRIPTION" : claims.onboardingCompleted === false ? "ONBOARDING" : "DASHBOARD",
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
