import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import {
  ClinicalHistoryPayloadSchema,
  type ClinicalHistoryPayload,
} from '@/lib/clinicalHistorySchema'
import {
  buildEmptyClinicalHistory,
  calculateClinicalCompletionPct,
  migrateFromMedicalRecord,
} from '@/lib/clinicalFormat'

export class ClinicalHistoryService {
  static async getByPatientId(patientId: string) {
    return prisma.clinicalHistory.findUnique({ where: { patientId } })
  }

  static async getOrBuildForPatient(patientId: string, doctorId: string) {
    const existing = await this.getByPatientId(patientId)
    if (existing) return { record: existing, migrated: false }

    const legacy = await prisma.medicalRecord.findUnique({ where: { patientId } })
    const payload = legacy
      ? migrateFromMedicalRecord(legacy)
      : buildEmptyClinicalHistory()

    return {
      record: {
        id: null as string | null,
        patientId,
        doctorId,
        payload,
        completionPct: payload.completionPct,
        status: payload.status,
        lastReviewedAt: null as Date | null,
        createdAt: null as Date | null,
        updatedAt: null as Date | null,
      },
      migrated: Boolean(legacy),
    }
  }

  static async upsertByPatientId(
    patientId: string,
    doctorId: string,
    payload: ClinicalHistoryPayload,
    opts: { actorUserId?: string | null } = {},
  ) {
    const parsed = ClinicalHistoryPayloadSchema.parse(payload)
    parsed.completionPct = calculateClinicalCompletionPct(parsed)
    const payloadJson = parsed as unknown as Prisma.InputJsonValue

    return prisma.$transaction(async (tx) => {
      const record = await tx.clinicalHistory.upsert({
        where: { patientId },
        create: {
          patientId,
          doctorId,
          payload: payloadJson,
          completionPct: parsed.completionPct,
          status: parsed.status,
          lastReviewedAt: new Date(),
        },
        update: {
          payload: payloadJson,
          completionPct: parsed.completionPct,
          status: parsed.status,
          lastReviewedAt: new Date(),
        },
      })

      await tx.clinicalHistoryVersion.create({
        data: {
          clinicalHistoryId: record.id,
          patientId,
          doctorId,
          payload: payloadJson,
          completionPct: parsed.completionPct,
          status: parsed.status,
          actorUserId: opts.actorUserId ?? null,
        },
      })

      return record
    })
  }
}
