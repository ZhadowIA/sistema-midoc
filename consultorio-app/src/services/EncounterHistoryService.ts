import { Prisma } from '@prisma/client'
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
}
