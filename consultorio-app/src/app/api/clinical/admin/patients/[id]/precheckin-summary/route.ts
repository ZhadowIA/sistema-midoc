import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireClinicalAccess } from '@/lib/medicalApi'
import { can, PERMISSIONS } from '@/lib/permissions'
import { getPatientPrecheckinSummary } from '@/server/clinical'

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  try {
    const access = await requireClinicalAccess()
    if (access.response) return access.response
    const authUser = access.context.user

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
      if (
        !actor?.clinicId ||
        !can(authUser, PERMISSIONS.CLINIC_MANAGE_DOCTORS, {
          sameClinic: actor.clinicId === patient.clinicId,
        })
      ) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
      }
    }

    const { precheckin, documents } = await getPatientPrecheckinSummary(patient.id)

    return NextResponse.json({ precheckin, documents })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
