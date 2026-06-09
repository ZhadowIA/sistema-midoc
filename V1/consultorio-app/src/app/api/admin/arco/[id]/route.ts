import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { can, PERMISSIONS } from '@/lib/permissions'

const schema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED']),
  resolutionText: z.string().max(4000).optional(),
  evidenceRef: z.string().max(500).optional(),
})

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const authUser = access.context.user
    const doctorId = access.context.doctorId
    if (!can(authUser, PERMISSIONS.CLINICAL_NOTE_WRITE)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', details: parsed.error.issues }, { status: 400 })
    }

    const targetRequest = await prisma.arcoRequest.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        clinicId: true,
        patient: {
          select: {
            ownerDoctorId: true,
            appointments: {
              where: { doctorId },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    })
    if (!targetRequest) return NextResponse.json({ error: 'Solicitud ARCO no encontrada' }, { status: 404 })

    if (authUser.role !== 'ADMIN') {
      const hasDoctorScope =
        targetRequest.patient.ownerDoctorId === doctorId || targetRequest.patient.appointments.length > 0
      if (authUser.role === 'DOCTOR' && !hasDoctorScope) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
      }
      if (authUser.role === 'CLINIC_ADMIN') {
        const actor = await prisma.user.findUnique({
          where: { id: authUser.id },
          select: { clinicId: true },
        })
        if (!actor?.clinicId || actor.clinicId !== targetRequest.clinicId) {
          return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
        }
      }
    }

    const updated = await prisma.arcoRequest.update({
      where: { id: params.id },
      data: {
        status: parsed.data.status,
        resolutionText: parsed.data.resolutionText,
        evidenceRef: parsed.data.evidenceRef,
        resolvedByUserId: parsed.data.status === 'RESOLVED' || parsed.data.status === 'REJECTED' ? authUser.id : null,
        resolvedAt: parsed.data.status === 'RESOLVED' || parsed.data.status === 'REJECTED' ? new Date() : null,
      },
    })

    return NextResponse.json({ success: true, request: updated })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
