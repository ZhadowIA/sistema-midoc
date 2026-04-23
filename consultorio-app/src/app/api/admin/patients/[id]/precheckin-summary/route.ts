import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || (authUser.role !== 'DOCTOR' && authUser.role !== 'ADMIN' && authUser.role !== 'CLINIC_ADMIN')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const patient = await prisma.patient.findUnique({
      where: { id: params.id },
      select: { id: true, ownerDoctorId: true, clinicId: true },
    })
    if (!patient) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })

    if (authUser.role === 'DOCTOR' && patient.ownerDoctorId !== authUser.id) {
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