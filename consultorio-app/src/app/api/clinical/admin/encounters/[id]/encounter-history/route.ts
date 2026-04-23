import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { EncounterHistoryService } from '@/services/EncounterHistoryService'
import { EncounterHistoryPayloadSchema } from '@/lib/encounterHistorySchema'
import { isClinicalHistoryEnabled } from '@/lib/featureFlags'

function disabledResponse() {
  return jsonNoStore({ error: 'Historia clínica no habilitada' }, { status: 404 })
}

async function loadEncounter(encounterId: string, doctorId: string) {
  return prisma.clinicalEncounter.findFirst({
    where: { id: encounterId, doctorId },
    select: { id: true, patientId: true, doctorId: true, appointmentId: true },
  })
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isClinicalHistoryEnabled()) return disabledResponse()
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const encounter = await loadEncounter(params.id, doctorId)
    if (!encounter) {
      return jsonNoStore({ error: 'Encounter no encontrado' }, { status: 404 })
    }

    const result = await EncounterHistoryService.getOrBuildForClinicalEncounter({
      clinicalEncounterId: encounter.id,
      appointmentId: encounter.appointmentId,
    })
    return jsonNoStore({ ...result, patientId: encounter.patientId })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isClinicalHistoryEnabled()) return disabledResponse()
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId
    const actorUserId = access.context.user.id

    const encounter = await loadEncounter(params.id, doctorId)
    if (!encounter) {
      return jsonNoStore({ error: 'Encounter no encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = EncounterHistoryPayloadSchema.safeParse(body?.payload ?? body)
    if (!parsed.success) {
      return jsonNoStore(
        { error: 'Payload inválido', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const saved = await EncounterHistoryService.upsertByClinicalEncounterId(
      params.id,
      encounter.appointmentId,
      encounter.patientId,
      doctorId,
      parsed.data,
      { actorUserId },
    )

    return jsonNoStore(saved)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
