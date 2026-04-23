import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'

const schema = z.object({
  mode: z.enum(['SOFT', 'HARD']),
  reason: z.string().min(5).max(1000),
})

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || (authUser.role !== 'DOCTOR' && authUser.role !== 'ADMIN' && authUser.role !== 'CLINIC_ADMIN')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', details: parsed.error.issues }, { status: 400 })
    }

    const patient = await prisma.patient.findUnique({ where: { id: params.id } })
    if (!patient) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })

    if (parsed.data.mode === 'SOFT') {
      await prisma.$transaction(async (tx) => {
        await tx.patient.update({
          where: { id: patient.id },
          data: {
            firstName: 'ANONIMIZADO',
            lastNamePaternal: `PACIENTE-${patient.id.slice(0, 6)}`,
            lastNameMaternal: null,
            phone: `anon-${patient.id.slice(0, 10)}`,
            email: null,
            taxId: null,
            fiscalZipCode: null,
          },
        })

        await tx.dataDeletionLog.create({
          data: {
            patientId: patient.id,
            performedByUserId: authUser.id,
            mode: 'SOFT',
            reason: parsed.data.reason,
            metadata: {
              action: 'patient_anonymized',
            },
          },
        })
      })

      return NextResponse.json({ success: true, mode: 'SOFT' })
    }

    await prisma.$transaction(async (tx) => {
      await tx.dataDeletionLog.create({
        data: {
          patientId: patient.id,
          performedByUserId: authUser.id,
          mode: 'HARD',
          reason: parsed.data.reason,
          metadata: {
            action: 'patient_deleted',
          },
        },
      })

      await tx.patient.delete({ where: { id: patient.id } })
    })

    return NextResponse.json({ success: true, mode: 'HARD' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}