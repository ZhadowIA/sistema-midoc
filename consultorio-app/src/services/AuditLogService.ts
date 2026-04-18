import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type AuditLogInput = {
  doctorId?: string | null;
  appointmentId?: string | null;
  patientId?: string | null;
  actorUserId?: string | null;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

function optionalString(value: string | null | undefined) {
  return value ?? null;
}

export class AuditLogService {
  static async log(input: AuditLogInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.auditLog.create({
      data: {
        doctorId: optionalString(input.doctorId),
        appointmentId: optionalString(input.appointmentId),
        patientId: optionalString(input.patientId),
        actorUserId: optionalString(input.actorUserId),
        action: input.action,
        ipAddress: optionalString(input.ipAddress),
        userAgent: optionalString(input.userAgent),
        metadata: input.metadata === null ? Prisma.JsonNull : input.metadata ?? undefined,
      },
    });
  }

  static async safeLog(input: AuditLogInput, tx?: Prisma.TransactionClient) {
    try {
      await this.log(input, tx);
    } catch (error) {
      console.error("[AuditLogService] No se pudo registrar auditoría", {
        action: input.action,
        appointmentId: input.appointmentId ?? null,
        error,
      });
    }
  }
}
