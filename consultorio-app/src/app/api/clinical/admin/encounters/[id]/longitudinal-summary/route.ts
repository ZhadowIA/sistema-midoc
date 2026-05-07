import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { buildLongitudinalSummary } from '@/lib/longitudinalSummary'

const MAX_PRIOR_ENCOUNTERS = 10

async function loadEncounter(encounterId: string, doctorId: string) {
  return prisma.clinicalEncounter.findFirst({
    where: { id: encounterId, doctorId },
    select: { id: true, patientId: true, openedAt: true },
  })
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const encounter = await loadEncounter(params.id, doctorId)
    if (!encounter) {
      return jsonNoStore({ error: 'Encounter no encontrado' }, { status: 404 })
    }

    // Fetch prior encounters for the same patient, excluding the current one
    const priorEncounters = await prisma.clinicalEncounter.findMany({
      where: {
        doctorId,
        patientId: encounter.patientId,
        id: { not: encounter.id },
        openedAt: { lt: encounter.openedAt },
        status: { not: 'ARCHIVED' },
      },
      orderBy: { openedAt: 'desc' },
      take: MAX_PRIOR_ENCOUNTERS,
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        status: true,
        encounterHistory: {
          select: {
            payload: true,
            completionPct: true,
          },
        },
        clinicalNote: {
          select: {
            subjective: true,
            objective: true,
            assessment: true,
            plan: true,
            signedAt: true,
          },
        },
        appointment: {
          select: {
            startTime: true,
          },
        },
      },
    })

    const summary = buildLongitudinalSummary(priorEncounters)

    return jsonNoStore({
      patientId: encounter.patientId,
      currentEncounterId: encounter.id,
      totalPrior: priorEncounters.length,
      entries: summary,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
