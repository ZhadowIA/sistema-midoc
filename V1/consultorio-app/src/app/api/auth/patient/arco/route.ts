import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { getPatientContextByUser } from '@/lib/patientPortalContext'

const schema = z.object({
  type: z.enum(['ACCESS', 'RECTIFICATION', 'CANCELLATION', 'OPPOSITION']),
  requestText: z.string().min(10).max(4000),
})

export async function GET() {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || authUser.role !== 'PATIENT') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const context = await getPatientContextByUser(authUser.id)
    if (!context) return NextResponse.json({ requests: [] })

    const requests = await prisma.arcoRequest.findMany({
      where: { patientId: context.patientId },
      orderBy: { requestedAt: 'desc' },
      take: 30,
    })

    return NextResponse.json({ requests })
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
    if (!context) {
      return NextResponse.json({ error: 'No se encontró perfil de paciente' }, { status: 409 })
    }

    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', details: parsed.error.issues }, { status: 400 })
    }

    const created = await prisma.arcoRequest.create({
      data: {
        patientId: context.patientId,
        clinicId: context.clinicId ?? null,
        requestedByUserId: authUser.id,
        type: parsed.data.type,
        status: 'OPEN',
        requestText: parsed.data.requestText,
      },
    })

    return NextResponse.json({ success: true, request: created }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}