import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const encounter = await prisma.clinicalEncounter.findFirst({
      where: { id: params.id, doctorId },
      select: {
        id: true,
        doctorId: true,
        patientId: true,
        clinicId: true,
        appointmentId: true,
        source: true,
        status: true,
        openedAt: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastNamePaternal: true,
            lastNameMaternal: true,
            phone: true,
          },
        },
        appointment: {
          select: {
            id: true,
            status: true,
            date: true,
            startTime: true,
            endTime: true,
            appointmentType: true,
          },
        },
        encounterHistory: {
          select: {
            id: true,
            appointmentId: true,
            status: true,
            completionPct: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    })

    if (!encounter) {
      return NextResponse.json({ error: 'Encounter no encontrado' }, { status: 404 })
    }

    return jsonNoStore({ encounter })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
