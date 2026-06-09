import prisma from "@/lib/prisma";
import { ConsentType, Prisma } from "@prisma/client";
import { AuditLogService } from "./AuditLogService";

type ConsentInput = {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  capturedByUserId?: string | null;
  type: ConsentType;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export class ConsentCaptureService {
  static async capture(input: ConsentInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    const consent = await client.consentCapture.create({
      data: {
        appointmentId: input.appointmentId,
        doctorId: input.doctorId,
        patientId: input.patientId,
        capturedByUserId: input.capturedByUserId ?? null,
        type: input.type,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata === null ? Prisma.JsonNull : input.metadata ?? undefined,
      },
    });

    await AuditLogService.safeLog(
      {
        doctorId: input.doctorId,
        appointmentId: input.appointmentId,
        patientId: input.patientId,
        actorUserId: input.capturedByUserId,
        action: "CONSENT_CAPTURED",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: {
          type: input.type,
          ...(typeof input.metadata === "object" && input.metadata !== null ? input.metadata : {}),
        },
      },
      tx
    );

    return consent;
  }
}
