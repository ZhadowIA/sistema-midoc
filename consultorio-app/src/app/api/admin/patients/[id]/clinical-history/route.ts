import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { ClinicalHistoryService } from '@/services/ClinicalHistoryService'
import { ClinicalHistoryPayloadSchema } from '@/lib/clinicalHistorySchema'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { AuditActorType, AuditSource } from '@prisma/client'
import { isClinicalHistoryEnabled } from '@/lib/featureFlags'
import { safeLogClinicalAccess } from '@/lib/clinicalAudit'

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

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isClinicalHistoryEnabled()) return disabledResponse()
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const { patient, ok } = await assertPatientAccess(params.id, doctorId)
    if (!patient) return jsonNoStore({ error: 'Paciente no encontrado' }, { status: 404 })
    if (!ok) return jsonNoStore({ error: 'No autorizado' }, { status: 403 })

    await safeLogClinicalAccess({
      request,
      action: 'CLINICAL_HISTORY_VIEWED',
      doctorId,
      actorUserId: access.context.user.id,
      patientId: patient.id,
      metadata: { route: '/api/admin/patients/[id]/clinical-history' },
    })

    const [result, versions] = await Promise.all([
      ClinicalHistoryService.getOrBuildForPatient(params.id, doctorId),
      ClinicalHistoryService.listVersionsByPatientId(params.id, 12),
    ])
    return jsonNoStore({
      ...result,
      versions: versions.map((version) => ({
        id: version.id,
        createdAt: version.createdAt,
        status: version.status,
        completionPct: version.completionPct,
        actorUserId: version.actorUserId,
      })),
    })
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

    const { patient, ok } = await assertPatientAccess(params.id, doctorId)
    if (!patient) return jsonNoStore({ error: 'Paciente no encontrado' }, { status: 404 })
    if (!ok) return jsonNoStore({ error: 'No autorizado' }, { status: 403 })

    const body = await request.json()
    const parsed = ClinicalHistoryPayloadSchema.safeParse(body?.payload ?? body)
    if (!parsed.success) {
      return jsonNoStore(
        { error: 'Payload inválido', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const saved = await ClinicalHistoryService.upsertByPatientId(
      params.id,
      doctorId,
      parsed.data,
      { actorUserId },
    )

    await AppointmentAuditService.safeLog({
      doctorId,
      patientId: params.id,
      actorType: AuditActorType.DOCTOR,
      actorUserId,
      source: AuditSource.ADMIN_PANEL,
      action: 'CLINICAL_HISTORY_UPDATED',
      metadata: { completionPct: saved.completionPct, status: saved.status },
    })

    return jsonNoStore(saved)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
