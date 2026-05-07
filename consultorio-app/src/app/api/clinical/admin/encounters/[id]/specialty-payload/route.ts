import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { isClinicalHistoryEnabled } from '@/lib/featureFlags'
import { SpecialtyPayloadSchema } from '@/lib/specialtyPayloadSchemas'
import { buildEmptyEncounterHistory } from '@/lib/clinicalFormat'

function disabledResponse() {
  return jsonNoStore({ error: 'Historia clínica no habilitada' }, { status: 404 })
}

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
) {
  if (!isClinicalHistoryEnabled()) return disabledResponse()
  const { id } = await props.params

  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const encounter = await prisma.clinicalEncounter.findFirst({
      where: { id, doctorId },
      select: { id: true },
    })
    if (!encounter) return jsonNoStore({ error: 'Encounter no encontrado' }, { status: 404 })

    const history = await prisma.encounterHistory.findFirst({
      where: { clinicalEncounterId: id },
      select: { specialtyPayload: true },
    })

    return jsonNoStore({ specialtyPayload: history?.specialtyPayload ?? null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  if (!isClinicalHistoryEnabled()) return disabledResponse()
  const { id } = await props.params

  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const encounter = await prisma.clinicalEncounter.findFirst({
      where: { id, doctorId },
      select: { id: true, appointmentId: true, patientId: true },
    })
    if (!encounter) return jsonNoStore({ error: 'Encounter no encontrado' }, { status: 404 })

    const body = await request.json()
    const parsed = SpecialtyPayloadSchema.safeParse(body)
    if (!parsed.success) {
      return jsonNoStore({ error: 'Payload inválido', issues: parsed.error.issues }, { status: 400 })
    }

    // Store the full discriminated union {specialty, data} as-is.
    // Some encounters can still lack EncounterHistory row, so we upsert by clinicalEncounterId.
    await prisma.encounterHistory.upsert({
      where: { clinicalEncounterId: id },
      update: { specialtyPayload: parsed.data },
      create: {
        clinicalEncounterId: id,
        appointmentId: encounter.appointmentId ?? null,
        patientId: encounter.patientId,
        doctorId,
        payload: buildEmptyEncounterHistory() as unknown as Prisma.InputJsonValue,
        specialtyPayload: parsed.data,
      },
    })

    return jsonNoStore({ success: true, specialtyPayload: parsed.data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
