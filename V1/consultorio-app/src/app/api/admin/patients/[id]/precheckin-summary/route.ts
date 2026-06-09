import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const authUser = access.context.user
    const doctorId = access.context.doctorId

    const patient = await prisma.patient.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        ownerDoctorId: true,
        clinicId: true,
        appointments: {
          where: { doctorId },
          select: { id: true },
          take: 1,
        },
      },
    })
    if (!patient) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })

    const hasDoctorScope = patient.ownerDoctorId === doctorId || patient.appointments.length > 0
    if (authUser.role === 'DOCTOR' && !hasDoctorScope) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    if (authUser.role === 'CLINIC_ADMIN') {
      const actor = await prisma.user.findUnique({ where: { id: authUser.id }, select: { clinicId: true } })
      if (!actor?.clinicId || actor.clinicId !== patient.clinicId) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
      }
    }

    const precheckin = await prisma.patientPreCheckin.findFirst({
      where: { patientId: patient.id },
      orderBy: { createdAt: 'desc' },
      include: {
        appointment: {
          select: { id: true, startTime: true, status: true },
        },
      },
    })

    const documents = await prisma.patientDocument.findMany({
      where: { patientId: patient.id, status: 'ACTIVE' },
      orderBy: { uploadedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        category: true,
        fileName: true,
        fileUrl: true,
        uploadedAt: true,
      },
    })

    return NextResponse.json({ precheckin, documents })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
