import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { getPatientContextByUser } from '@/lib/patientPortalContext'
import { getRequestIp, getUserAgent } from '@/lib/requestContext'
import { Prisma } from '@prisma/client'

const schema = z.object({
  appointmentId: z.string().min(1).optional(),
  consentType: z.enum(['SENSITIVE_DATA_PROCESSING', 'PORTAL_USAGE', 'TELECONSULTATION']),
  version: z.string().min(1).max(50),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function GET() {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || authUser.role !== 'PATIENT') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const context = await getPatientContextByUser(authUser.id)
    if (!context) return NextResponse.json({ consents: [] })

    const consents = await prisma.digitalConsent.findMany({
      where: { patientId: context.patientId },
      orderBy: { acceptedAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ consents })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || authUser.role !== 'PATIENT') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const context = await getPatientContextByUser(authUser.id)
    if (!context || !context.doctorId) {
      return NextResponse.json({ error: 'No se pudo resolver contexto del paciente' }, { status: 409 })
    }

    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', details: parsed.error.issues }, { status: 400 })
    }

    if (parsed.data.appointmentId) {
      const ownsAppointment = await prisma.appointment.findFirst({
        where: { id: parsed.data.appointmentId, patientId: context.patientId },
        select: { id: true },
      })
      if (!ownsAppointment) {
        return NextResponse.json({ error: 'La cita no pertenece al paciente autenticado' }, { status: 403 })
      }
    }

    const consent = await prisma.digitalConsent.create({
      data: {
        patientId: context.patientId,
        appointmentId: parsed.data.appointmentId ?? null,
        doctorId: context.doctorId,
        consentType: parsed.data.consentType,
        version: parsed.data.version,
        acceptedAt: new Date(),
        actorType: 'PATIENT',
        source: 'PATIENT_PORTAL',
        ipAddress: getRequestIp(request),
        userAgent: getUserAgent(request),
        metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
      },
    })

    return NextResponse.json({ success: true, consent }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
