import { Prisma } from '@prisma/client'
import prisma from './prisma'
import { getRequestIp, getUserAgent } from './requestContext'
import { captureError } from './observability'

export type ClinicalAuditAction =
  | 'CLINICAL_PATIENT_VIEWED'
  | 'CLINICAL_HISTORY_VIEWED'
  | 'CLINICAL_APPOINTMENT_VIEWED'
  | 'CLINICAL_ENCOUNTER_CONTEXT_VIEWED'

type ClinicalAuditInput = {
  request: Request
  action: ClinicalAuditAction
  doctorId?: string | null
  actorUserId?: string | null
  patientId?: string | null
  appointmentId?: string | null
  metadata?: Prisma.InputJsonValue
}

export async function safeLogClinicalAccess(input: ClinicalAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        doctorId: input.doctorId ?? null,
        actorUserId: input.actorUserId ?? null,
        patientId: input.patientId ?? null,
        appointmentId: input.appointmentId ?? null,
        action: input.action,
        ipAddress: getRequestIp(input.request),
        userAgent: getUserAgent(input.request),
        metadata: input.metadata ?? undefined,
      },
    })
  } catch (error) {
    captureError('clinical.audit.log_failed', error)
  }
}
