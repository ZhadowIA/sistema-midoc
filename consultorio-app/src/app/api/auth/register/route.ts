import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { Prisma, MedicalSpecialty } from '@prisma/client'
import { attachSessionCookie, buildSessionToken } from '@/lib/session'
import { captureError, logEvent } from '@/lib/observability'
import { recordLegalAcceptance } from '@/lib/legalAcceptance'
import { COMMERCIAL_BASE_PLANS, resolveCommercialPlan } from '@/lib/subscriptionCatalog'
import { addDays } from 'date-fns'
import { buildProductAccessFromFeatures } from '@/lib/productAccess'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'
import { validatePasswordPolicy } from '@/lib/passwordPolicy'

const REGISTER_RATE_LIMIT = { key: 'auth:register', limit: 8, windowMs: 60 * 60 * 1000 }

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

function buildDoctorDisplayName(firstName: string, lastNamePaternal: string, lastNameMaternal?: string) {
  return [firstName, lastNamePaternal, lastNameMaternal].filter(Boolean).join(' ').trim()
}

function buildDefaultAvailabilityBlocks(doctorId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const blocks: Array<{
    doctorId: string
    date: Date
    startTime: Date
    endTime: Date
    isPublic: true
    active: true
  }> = []

  for (let i = 0; i < 30; i += 1) {
    const date = addDays(today, i)
    const day = date.getDay()
    if (day === 0 || day === 6) continue

    const morningStart = new Date(date)
    morningStart.setHours(9, 0, 0, 0)
    const morningEnd = new Date(date)
    morningEnd.setHours(14, 0, 0, 0)

    const afternoonStart = new Date(date)
    afternoonStart.setHours(15, 0, 0, 0)
    const afternoonEnd = new Date(date)
    afternoonEnd.setHours(17, 0, 0, 0)

    blocks.push(
      {
        doctorId,
        date,
        startTime: morningStart,
        endTime: morningEnd,
        isPublic: true,
        active: true,
      },
      {
        doctorId,
        date,
        startTime: afternoonStart,
        endTime: afternoonEnd,
        isPublic: true,
        active: true,
      }
    )
  }

  return blocks
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const firstName = asNonEmptyString(body.firstName)
    const lastNamePaternal = asNonEmptyString(body.lastNamePaternal)
    const lastNameMaternal = asNonEmptyString(body.lastNameMaternal)
    const rawName = asNonEmptyString(body.name)
    const phone = asNonEmptyString(body.phone)
    const email = asNonEmptyString(body.email).toLowerCase()
    const password = asNonEmptyString(body.password)
    const acceptTerms = body.acceptTerms === true
    const acceptPrivacy = body.acceptPrivacy === true

    const name =
      rawName || buildDoctorDisplayName(firstName, lastNamePaternal, lastNameMaternal || undefined)

    if (!name || !email || !password || !phone) {
      return NextResponse.json({ error: 'Nombre, apellido paterno, correo, teléfono y contraseña son requeridos' }, { status: 400 })
    }

    const limit = await checkRateLimit(request, { ...REGISTER_RATE_LIMIT, identifier: email || phone || 'anon' })
    if (!limit.ok) {
      logEvent('warn', 'auth.register.rate_limited', { email })
      return rateLimitExceededResponse(limit)
    }

    const passwordPolicy = validatePasswordPolicy(password)
    if (!passwordPolicy.ok) {
      return NextResponse.json({ error: passwordPolicy.message }, { status: 400 })
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
    const starterPlan = resolveCommercialPlan({ basePlan: COMMERCIAL_BASE_PLANS.INTEGRAL })

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone,
          passwordHash,
          role: 'DOCTOR',
          slug: buildSlugFromName(name),
          specialty: MedicalSpecialty.FAMILY_MEDICINE
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
          planName: starterPlan.legacyPlanName,
          amount: 899,
          currency: 'MXN',
          features: starterPlan.features as Prisma.InputJsonValue,
        },
      })

      await tx.doctorOnboarding.create({
        data: {
          doctorId: user.id,
          completed: false,
        },
      })

      await tx.availabilityBlock.createMany({
        data: buildDefaultAvailabilityBlocks(user.id),
      })

      await recordLegalAcceptance({
        userId: user.id,
        request,
        context: 'REGISTER',
        tx,
      })

      return user
    })

    const access = buildProductAccessFromFeatures(starterPlan.features)
    const token = await buildSessionToken({
      sub: result.id,
      role: result.role,
      hasActiveSubscription: false,
      onboardingCompleted: false,
      productPlan: access.plan,
      enabledModules: access.enabledModules,
      features: starterPlan.features,
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
    return NextResponse.json({ error: 'No fue posible completar el registro' }, { status: 500 })
  }
}
