import { Prisma, AiConsentState, ConsultationMode } from '@prisma/client'
import prisma from '@/lib/prisma'
import {
  EncounterHistoryPayloadSchema,
  type EncounterHistoryPayload,
} from '@/lib/encounterHistorySchema'
import {
  buildEmptyEncounterHistory,
  calculateEncounterCompletionPct,
} from '@/lib/clinicalFormat'

export class EncounterHistoryService {
  static async getByAppointmentId(appointmentId: string) {
    return prisma.encounterHistory.findUnique({ where: { appointmentId } })
  }

  static async getOrBuildForAppointment(appointmentId: string) {
    const existing = await this.getByAppointmentId(appointmentId)
    if (existing) return { record: existing, built: false }

    return {
      record: {
        id: null as string | null,
        appointmentId,
        payload: buildEmptyEncounterHistory(),
        completionPct: 0,
        status: 'DRAFT' as const,
        prefilledFromQuestionnaire: false,
        createdAt: null as Date | null,
        updatedAt: null as Date | null,
      },
      built: true,
    }
  }

  static async getByClinicalEncounterId(clinicalEncounterId: string) {
    return prisma.encounterHistory.findUnique({ where: { clinicalEncounterId } })
  }

  static async getOrBuildForClinicalEncounter(input: {
    clinicalEncounterId: string
    appointmentId?: string | null
  }) {
    const existing = await this.getByClinicalEncounterId(input.clinicalEncounterId)
    if (existing) return { record: existing, built: false }

    return {
      record: {
        id: null as string | null,
        appointmentId: input.appointmentId ?? null,
        clinicalEncounterId: input.clinicalEncounterId,
        payload: buildEmptyEncounterHistory(),
        completionPct: 0,
        status: 'DRAFT' as const,
        prefilledFromQuestionnaire: false,
        createdAt: null as Date | null,
        updatedAt: null as Date | null,
      },
      built: true,
    }
  }

  static async upsertByAppointmentId(
    appointmentId: string,
    patientId: string,
    doctorId: string,
    payload: EncounterHistoryPayload,
    opts?: { prefilledFromQuestionnaire?: boolean; actorUserId?: string | null },
  ) {
    const parsed = EncounterHistoryPayloadSchema.parse(payload)
    parsed.completionPct = calculateEncounterCompletionPct(parsed)
    const payloadJson = parsed as unknown as Prisma.InputJsonValue

    return prisma.$transaction(async (tx) => {
      const record = await tx.encounterHistory.upsert({
        where: { appointmentId },
        create: {
          appointmentId,
          patientId,
          doctorId,
          payload: payloadJson,
          completionPct: parsed.completionPct,
          status: parsed.status,
          prefilledFromQuestionnaire: opts?.prefilledFromQuestionnaire ?? false,
        },
        update: {
          payload: payloadJson,
          completionPct: parsed.completionPct,
          status: parsed.status,
          ...(opts?.prefilledFromQuestionnaire !== undefined
            ? { prefilledFromQuestionnaire: opts.prefilledFromQuestionnaire }
            : {}),
        },
      })

      await tx.encounterHistoryVersion.create({
        data: {
          encounterHistoryId: record.id,
          appointmentId,
          patientId,
          doctorId,
          payload: payloadJson,
          completionPct: parsed.completionPct,
          status: parsed.status,
          actorUserId: opts?.actorUserId ?? null,
        },
      })

      return record
    })
  }

  static async upsertByClinicalEncounterId(
    clinicalEncounterId: string,
    appointmentId: string | null,
    patientId: string,
    doctorId: string,
    payload: EncounterHistoryPayload,
    opts?: { prefilledFromQuestionnaire?: boolean; actorUserId?: string | null },
  ) {
    const parsed = EncounterHistoryPayloadSchema.parse(payload)
    parsed.completionPct = calculateEncounterCompletionPct(parsed)
    const payloadJson = parsed as unknown as Prisma.InputJsonValue

    return prisma.$transaction(async (tx) => {
      const record = await tx.encounterHistory.upsert({
        where: { clinicalEncounterId },
        create: {
          clinicalEncounterId,
          appointmentId: appointmentId ?? clinicalEncounterId,
          patientId,
          doctorId,
          payload: payloadJson,
          completionPct: parsed.completionPct,
          status: parsed.status,
          prefilledFromQuestionnaire: opts?.prefilledFromQuestionnaire ?? false,
        },
        update: {
          appointmentId: appointmentId ?? undefined,
          payload: payloadJson,
          completionPct: parsed.completionPct,
          status: parsed.status,
          ...(opts?.prefilledFromQuestionnaire !== undefined
            ? { prefilledFromQuestionnaire: opts.prefilledFromQuestionnaire }
            : {}),
        },
      })

      await tx.encounterHistoryVersion.create({
        data: {
          encounterHistoryId: record.id,
          appointmentId: appointmentId ?? clinicalEncounterId,
          patientId,
          doctorId,
          payload: payloadJson,
          completionPct: parsed.completionPct,
          status: parsed.status,
          actorUserId: opts?.actorUserId ?? null,
        },
      })

      return record
    })
  }

  static async setConsultationMode(
    appointmentId: string,
    patientId: string,
    doctorId: string,
    mode: ConsultationMode,
  ) {
    return prisma.encounterHistory.upsert({
      where: { appointmentId },
      create: {
        appointmentId,
        patientId,
        doctorId,
        payload: buildEmptyEncounterHistory() as unknown as Prisma.InputJsonValue,
        consultationMode: mode,
      },
      update: { consultationMode: mode },
    })
  }

  static async setAiConsent(
    appointmentId: string,
    patientId: string,
    doctorId: string,
    decision: AiConsentState,
    actorUserId: string | null,
  ) {
    return prisma.encounterHistory.upsert({
      where: { appointmentId },
      create: {
        appointmentId,
        patientId,
        doctorId,
        payload: buildEmptyEncounterHistory() as unknown as Prisma.InputJsonValue,
        aiConsent: decision,
        aiConsentDecidedAt: decision === 'PENDING' ? null : new Date(),
        aiConsentActorUserId: actorUserId,
      },
      update: {
        aiConsent: decision,
        aiConsentDecidedAt: decision === 'PENDING' ? null : new Date(),
        aiConsentActorUserId: actorUserId,
      },
    })
  }

  static async setSessionByClinicalEncounterId(input: {
    clinicalEncounterId: string
    appointmentId?: string | null
    patientId: string
    doctorId: string
    consultationMode?: ConsultationMode
    aiConsent?: AiConsentState
    actorUserId?: string | null
  }) {
    const existing = await prisma.encounterHistory.findUnique({
      where: { clinicalEncounterId: input.clinicalEncounterId },
      select: { id: true },
    })

    const baseCreate = {
      clinicalEncounterId: input.clinicalEncounterId,
      appointmentId: input.appointmentId ?? input.clinicalEncounterId,
      patientId: input.patientId,
      doctorId: input.doctorId,
      payload: buildEmptyEncounterHistory() as unknown as Prisma.InputJsonValue,
    }

    if (!existing) {
      return prisma.encounterHistory.create({
        data: {
          ...baseCreate,
          ...(input.consultationMode ? { consultationMode: input.consultationMode } : {}),
          ...(input.aiConsent
            ? {
                aiConsent: input.aiConsent,
                aiConsentDecidedAt: input.aiConsent === 'PENDING' ? null : new Date(),
                aiConsentActorUserId: input.actorUserId ?? null,
              }
            : {}),
        },
      })
    }

    return prisma.encounterHistory.update({
      where: { clinicalEncounterId: input.clinicalEncounterId },
      data: {
        ...(input.consultationMode ? { consultationMode: input.consultationMode } : {}),
        ...(input.aiConsent
          ? {
              aiConsent: input.aiConsent,
              aiConsentDecidedAt: input.aiConsent === 'PENDING' ? null : new Date(),
              aiConsentActorUserId: input.actorUserId ?? null,
            }
          : {}),
      },
    })
  }
}
