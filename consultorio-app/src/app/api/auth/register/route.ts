import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { attachSessionCookie, buildSessionToken } from '@/lib/session'
import { getServerEnv } from '@/lib/env'
import { captureError, logEvent } from '@/lib/observability'

function asNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildSlugFromName(fullName: string): string {
  const base = fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'medico'
  return `${base}-${Date.now().toString().slice(-6)}`
}

export async function POST(request: Request) {
  try {
    const env = getServerEnv()
    const body = await request.json()
    const firstName = asNonEmptyString(body.firstName)
    const lastName = asNonEmptyString(body.lastName)
    const rawName = asNonEmptyString(body.name)
    const phone = asNonEmptyString(body.phone)
    const email = asNonEmptyString(body.email).toLowerCase()
    const password = asNonEmptyString(body.password)
    const acceptTerms = body.acceptTerms === true
    const acceptPrivacy = body.acceptPrivacy === true

    const name = rawName || [firstName, lastName].filter(Boolean).join(' ').trim()

    if (!name || !email || !password || !phone) {
      return NextResponse.json({ error: 'Nombre, apellidos, correo, teléfono y contraseña son requeridos' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }
    if (!acceptTerms || !acceptPrivacy) {
      return NextResponse.json(
        { error: 'Debes aceptar Términos y Condiciones y Aviso de Privacidad' },
        { status: 400 }
      )
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json({ error: 'El correo ya está registrado' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    
    // Create base user and their initial config simultaneously
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone,
          passwordHash,
          role: 'DOCTOR',
          slug: buildSlugFromName(name),
          specialty: 'Médico Especialista'
        }
      })

      await tx.doctorConfig.create({
        data: {
          doctorId: user.id,
          consultationDurationMin: 30,
          extendedConsultationEnabled: false,
          normalConsultationPrice: 500,
        }
      })

      await tx.doctorSubscription.create({
        data: {
          doctorId: user.id,
          status: 'PENDING',
          planName: 'Plan Mensual MiDoc',
          amount: 899,
          currency: 'MXN',
        },
      })

      await tx.doctorOnboarding.create({
        data: {
          doctorId: user.id,
          completed: false,
        },
      })

      await tx.legalAcceptance.create({
        data: {
          userId: user.id,
          termsVersion: env.TERMS_VERSION,
          privacyVersion: env.PRIVACY_VERSION,
          termsAcceptedAt: new Date(),
          privacyAcceptedAt: new Date(),
        },
      })

      return user
    })

    const token = await buildSessionToken({
      sub: result.id,
      role: result.role,
      hasActiveSubscription: false,
      onboardingCompleted: false,
    })

    const response = NextResponse.json({
      success: true,
      nextStep: 'SUBSCRIPTION',
      user: { id: result.id, name: result.name, email: result.email },
    })
    attachSessionCookie(response, token)
    logEvent('info', 'auth.register.success', {
      userId: result.id,
      role: result.role,
    })

    return response
  } catch (error: unknown) {
    captureError('auth.register.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
