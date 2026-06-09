import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { isClinicalHistoryEnabled } from '@/lib/featureFlags'

function disabledResponse() {
  return jsonNoStore({ error: 'Historia clínica no habilitada' }, { status: 404 })
}

async function assertPatientAccess(patientId: string, doctorId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      ownerDoctorId: true,
      appointments: {
        where: { doctorId },
        select: { id: true },
        take: 1,
      },
    },
  })
  if (!patient) return { patient: null, ok: false as const }
  const ok = patient.ownerDoctorId === doctorId || patient.appointments.length > 0
  return { patient, ok }
}

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string; versionId: string }> },
) {
  if (!isClinicalHistoryEnabled()) return disabledResponse()
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const { patient, ok } = await assertPatientAccess(params.id, doctorId)
    if (!patient) return jsonNoStore({ error: 'Paciente no encontrado' }, { status: 404 })
    if (!ok) return jsonNoStore({ error: 'No autorizado' }, { status: 403 })

    const version = await prisma.clinicalHistoryVersion.findFirst({
      where: {
        id: params.versionId,
        patientId: params.id,
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
        completionPct: true,
        actorUserId: true,
        payload: true,
      },
    })

    if (!version) {
      return jsonNoStore({ error: 'Versión no encontrada' }, { status: 404 })
    }

    return jsonNoStore({ version })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}

