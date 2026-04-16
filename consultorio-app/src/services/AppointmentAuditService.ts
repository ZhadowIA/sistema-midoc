import {
  AppointmentStatus,
  AuditAction,
  AuditActorType,
  AuditSource,
  Prisma,
} from '@prisma/client'
import prisma from '@/lib/prisma'

type AuditMetadata = Prisma.InputJsonValue | null

type LogAuditInput = {
  doctorId: string
  appointmentId?: string | null
  patientId?: string | null
  actorType: AuditActorType
  actorUserId?: string | null
  source: AuditSource
  action: AuditAction
  fromStatus?: AppointmentStatus | null
  toStatus?: AppointmentStatus | null
  metadata?: AuditMetadata
}

function normalizeOptional(value: string | null | undefined) {
  return value ?? null
}

export class AppointmentAuditService {
  static async log(input: LogAuditInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma
    return client.appointmentAuditLog.create({
      data: {
        doctorId: input.doctorId,
        appointmentId: normalizeOptional(input.appointmentId),
        patientId: normalizeOptional(input.patientId),
        actorType: input.actorType,
        actorUserId: normalizeOptional(input.actorUserId),
        source: input.source,
        action: input.action,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        metadata:
          input.metadata === null
            ? Prisma.JsonNull
            : input.metadata ?? undefined,
      },
    })
  }

  static async safeLog(input: LogAuditInput, tx?: Prisma.TransactionClient) {
    try {
      await this.log(input, tx)
    } catch (error) {
      console.error('[AppointmentAuditService] No se pudo registrar evento de auditoría', {
        action: input.action,
        doctorId: input.doctorId,
        appointmentId: input.appointmentId ?? null,
        error,
      })
    }
  }
}
