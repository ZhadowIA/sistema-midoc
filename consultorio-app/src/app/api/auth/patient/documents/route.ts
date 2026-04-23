import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { getPatientContextByUser } from '@/lib/patientPortalContext'

const schema = z.object({
  appointmentId: z.string().min(1).optional(),
  category: z.enum(['STUDY', 'IDENTIFICATION', 'INSURANCE', 'OTHER']),
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().url(),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.number().int().positive().optional(),
})

export async function GET() {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || authUser.role !== 'PATIENT') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const context = await getPatientContextByUser(authUser.id)
    if (!context) return NextResponse.json({ documents: [] })

    const documents = await prisma.patientDocument.findMany({
      where: { patientId: context.patientId },
      orderBy: { uploadedAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ documents })
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

    const document = await prisma.patientDocument.create({
      data: {
        patientId: context.patientId,
        appointmentId: parsed.data.appointmentId ?? null,
        doctorId: context.doctorId,
        category: parsed.data.category,
        fileName: parsed.data.fileName,
        fileUrl: parsed.data.fileUrl,
        mimeType: parsed.data.mimeType,
        sizeBytes: parsed.data.sizeBytes,
      },
    })

    return NextResponse.json({ success: true, document }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}