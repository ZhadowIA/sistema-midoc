import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { toLocalDateKey } from '@/lib/dateTime'
import { attachSessionCookie, buildSessionToken } from '@/lib/session'
import { captureError, logEvent } from '@/lib/observability'

const loginPatientSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

export async function POST(request: Request) {
  try {
    const parsed = loginPatientSchema.parse(await request.json())
    const email = parsed.email.trim().toLowerCase()
    const password = parsed.password

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
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash)
    if (!validPassword) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const token = await buildSessionToken({ sub: user.id, role: user.role })

    const latestPatient = await prisma.patient.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        fullName: true,
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
            fullName: latestPatient.fullName,
            phone: latestPatient.phone,
            email: latestPatient.email,
            dateOfBirth: toLocalDateKey(latestPatient.dateOfBirth),
          }
        : null,
    })

    attachSessionCookie(response, token)
    logEvent('info', 'auth.patient.login.success', { userId: user.id })

    return response
  } catch (error: unknown) {
    captureError('auth.patient.login.error', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
