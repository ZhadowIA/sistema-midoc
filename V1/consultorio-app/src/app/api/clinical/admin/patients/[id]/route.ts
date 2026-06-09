import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { ClinicalHistoryService } from '@/services/ClinicalHistoryService'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { AuditActorType, AuditSource } from '@prisma/client'
import {
  ClinicalHistoryPayloadSchema,
  type ClinicalHistoryPayload,
} from '@/lib/clinicalHistorySchema'
import { buildEmptyClinicalHistory } from '@/lib/clinicalFormat'
import { safeLogClinicalAccess } from '@/lib/clinicalAudit'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const patient = await prisma.patient.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        medicalRecord: true,
        clinicalHistory: true,
        appointments: {
          where: { doctorId },
          orderBy: { startTime: 'desc' },
          include: {
            clinicalNote: true,
            questionnaire: {
              select: {
                createdAt: true,
              },
            },
            notifications: {
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                type: true,
                status: true,
                createdAt: true,
                sentAt: true,
              },
            },
          },
        },
      },
    })

    if (!patient) return jsonNoStore({ error: 'Paciente no encontrado' }, { status: 404 })

    const isOwnedByDoctor = patient.ownerDoctorId === doctorId || patient.appointments.length > 0
    if (!isOwnedByDoctor) {
      return jsonNoStore({ error: 'No autorizado para ver este paciente' }, { status: 403 })
    }

    if (!patient.ownerDoctorId) {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { ownerDoctorId: doctorId },
      })
      patient.ownerDoctorId = doctorId
    }

    await safeLogClinicalAccess({
      request,
      action: 'CLINICAL_PATIENT_VIEWED',
      doctorId,
      actorUserId: access.context.user.id,
      patientId: patient.id,
      metadata: { route: '/api/clinical/admin/patients/[id]' },
    })

    const timeline = patient.appointments.map((appointment) => {
      const note = appointment.clinicalNote
      const soapSections = [note?.subjective, note?.objective, note?.assessment, note?.plan]
      const completedSoapSections = soapSections.filter((section) => Boolean(section?.trim())).length
      const soapCompletionPct = Math.round((completedSoapSections / 4) * 100)

      const notificationSummary = appointment.notifications.reduce(
        (acc, notification) => {
          acc.total += 1
          if (notification.status === 'SENT') acc.sent += 1
          if (notification.status === 'FAILED') acc.failed += 1
          if (notification.status === 'PENDING') acc.pending += 1
          return acc
        },
        { total: 0, sent: 0, failed: 0, pending: 0 }
      )

      return {
        id: appointment.id,
        status: appointment.status,
        source: appointment.source,
        appointmentType: appointment.appointmentType,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        durationMin: appointment.durationMin,
        questionnaireAnswered: appointment.questionnaireAnswered,
        questionnaireAnsweredAt: appointment.questionnaire?.createdAt || null,
        hasClinicalNote: Boolean(note),
        soap: note
          ? {
              subjective: note.subjective,
              objective: note.objective,
              assessment: note.assessment,
              plan: note.plan,
            }
          : null,
        soapCompletion: {
          completedSections: completedSoapSections,
          totalSections: 4,
          pct: soapCompletionPct,
        },
        notificationSummary,
      }
    })

    const summary = {
      totalAppointments: timeline.length,
      completedAppointments: timeline.filter((item) => item.status === 'COMPLETED').length,
      appointmentsWithSoap: timeline.filter((item) => item.hasClinicalNote).length,
      questionnairesAnswered: timeline.filter((item) => item.questionnaireAnswered).length,
    }

    return jsonNoStore({
      ...patient,
      clinicalHistorySummary: patient.clinicalHistory
        ? {
            completionPct: patient.clinicalHistory.completionPct,
            status: patient.clinicalHistory.status,
            lastReviewedAt: patient.clinicalHistory.lastReviewedAt,
          }
        : null,
      linkedAccount: patient.user
        ? {
            id: patient.user.id,
            name: patient.user.name,
            email: patient.user.email,
          }
        : null,
      timeline,
      summary,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const body = await request.json()

    const patient = await prisma.patient.findUnique({
      where: { id: params.id },
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

    if (!patient) return jsonNoStore({ error: 'Paciente no encontrado' }, { status: 404 })

    const isOwnedByDoctor = patient.ownerDoctorId === doctorId || patient.appointments.length > 0
    if (!isOwnedByDoctor) {
      return jsonNoStore({ error: 'No autorizado para modificar este paciente' }, { status: 403 })
    }

    if (!patient.ownerDoctorId) {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { ownerDoctorId: doctorId },
      })
    }

    // Retiro gradual: los campos legacy (bloodType, allergies, chronicConditions,
    // familyHistory) ya no se escriben en MedicalRecord. Se redirigen a
    // ClinicalHistory para consolidar el expediente clínico.
    const actorUserId = access.context.user.id
    const { record: current } = await ClinicalHistoryService.getOrBuildForPatient(
      params.id,
      doctorId,
    )
    const parsed = ClinicalHistoryPayloadSchema.safeParse(current.payload)
    const payload: ClinicalHistoryPayload = parsed.success
      ? parsed.data
      : buildEmptyClinicalHistory()

    if (body.bloodType !== undefined) {
      payload.identification.bloodType = body.bloodType || null
    }
    if (body.allergies !== undefined) {
      const text = typeof body.allergies === 'string' ? body.allergies.trim() : ''
      payload.allergies = text
        ? [{ description: text, source: 'patient:update' }]
        : []
    }
    if (body.chronicConditions !== undefined) {
      if (body.chronicConditions) {
        payload.pathologicalHistory.chronicConditions = body.chronicConditions
      } else {
        delete payload.pathologicalHistory.chronicConditions
      }
    }
    if (body.familyHistory !== undefined) {
      if (body.familyHistory) {
        payload.familyHistory.summary = body.familyHistory
      } else {
        delete payload.familyHistory.summary
      }
    }

    const saved = await ClinicalHistoryService.upsertByPatientId(
      params.id,
      doctorId,
      payload,
      { actorUserId },
    )

    await AppointmentAuditService.safeLog({
      doctorId,
      patientId: params.id,
      actorType: AuditActorType.DOCTOR,
      actorUserId,
      source: AuditSource.ADMIN_PANEL,
      action: 'CLINICAL_HISTORY_UPDATED',
      metadata: {
        completionPct: saved.completionPct,
        status: saved.status,
        via: 'patient.patch.legacy-compat',
      },
    })

    return jsonNoStore({
      bloodType: payload.identification.bloodType ?? null,
      allergies:
        payload.allergies[0] && typeof payload.allergies[0].description === 'string'
          ? (payload.allergies[0].description as string)
          : null,
      chronicConditions:
        typeof payload.pathologicalHistory.chronicConditions === 'string'
          ? (payload.pathologicalHistory.chronicConditions as string)
          : null,
      familyHistory:
        typeof payload.familyHistory.summary === 'string'
          ? (payload.familyHistory.summary as string)
          : null,
      clinicalHistory: {
        completionPct: saved.completionPct,
        status: saved.status,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
