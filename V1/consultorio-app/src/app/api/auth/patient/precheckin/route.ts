import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { getPatientContextByUser } from '@/lib/patientPortalContext'

const schema = z.object({
  appointmentId: z.string().min(1).optional(),
  attendanceConfirmed: z.boolean().default(false),
  demographicsConfirmed: z.boolean().default(false),
  pendingPaymentsAcknowledged: z.boolean().default(false),
  checklist: z.array(z.string().min(1)).max(20).optional(),
  notes: z.string().max(1000).optional(),
})

export async function GET(request: Request) {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || authUser.role !== 'PATIENT') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const context = await getPatientContextByUser(authUser.id)
    if (!context) return NextResponse.json({ precheckins: [] })

    const appointmentId = new URL(request.url).searchParams.get('appointmentId')

    const precheckins = await prisma.patientPreCheckin.findMany({
      where: {
        patientId: context.patientId,
        ...(appointmentId ? { appointmentId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    return NextResponse.json({ precheckins })
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
        where: {
          id: parsed.data.appointmentId,
          patientId: context.patientId,
        },
        select: { id: true },
      })
      if (!ownsAppointment) {
        return NextResponse.json({ error: 'La cita no pertenece al paciente autenticado' }, { status: 403 })
      }
    }

    const created = await prisma.patientPreCheckin.create({
      data: {
        patientId: context.patientId,
        appointmentId: parsed.data.appointmentId ?? null,
        doctorId: context.doctorId,
        attendanceConfirmed: parsed.data.attendanceConfirmed,
        demographicsConfirmed: parsed.data.demographicsConfirmed,
        pendingPaymentsAcknowledged: parsed.data.pendingPaymentsAcknowledged,
        checklist: parsed.data.checklist ?? undefined,
        notes: parsed.data.notes,
      },
    })

    return NextResponse.json({ success: true, precheckin: created }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}