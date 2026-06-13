import {
  AiProviderType,
  AiUsageStatus,
  AiUsageType,
  MailboxDocumentStatus,
  Prisma,
  SyncDeviceStatus,
  SyncEventType,
  UserRole,
  type SyncDevice
} from "@prisma/client";
import { z } from "zod";

import { writeAuditLog } from "../../lib/audit";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { generateOpaqueToken, hashOpaqueToken } from "../../lib/security/token";

const INBOX_BATCH_SIZE = 100;
const AI_USAGE_BATCH_SIZE = 100;

class SyncServiceError extends ServiceError {}

const aiUsageReferenceSchema = z
  .object({
    kind: z.enum(["LOCAL_AI_RUN_INPUT", "LOCAL_AI_RUN_OUTPUT"]),
    localRunId: z.string().min(1).max(100),
    patientId: z.string().min(1).max(100).optional(),
    encounterId: z.string().min(1).max(100).optional()
  })
  .strict();

const aiUsageReportSchema = z
  .object({
    externalRunId: z.string().min(1).max(100),
    usageType: z.enum([
      "SOAP_ASSIST",
      "LONGITUDINAL_SUMMARY",
      "PATIENT_INSTRUCTIONS",
      "CLINICAL_GAPS",
      "TRANSCRIPTION",
      "VALIDATION",
      "OTHER"
    ]),
    status: z.enum(["DRAFT", "APPROVED", "DISCARDED", "FAILED"]),
    providerName: z.string().min(1).max(120),
    providerType: z.enum(["LLM", "TRANSCRIPTION", "SCRIBE", "VALIDATION"]).default("LLM"),
    modelVersion: z.string().min(1).max(120).optional(),
    promptVersion: z.string().min(1).max(120).optional(),
    estimatedCostCents: z.number().int().min(0).optional(),
    latencyMs: z.number().int().min(0).optional(),
    occurredAt: z.string().datetime(),
    inputReference: aiUsageReferenceSchema,
    outputReference: aiUsageReferenceSchema
  })
  .strict();

const aiUsageBatchSchema = z
  .object({
    runs: z.array(aiUsageReportSchema).min(1).max(AI_USAGE_BATCH_SIZE)
  })
  .strict();

type AiUsageReport = z.infer<typeof aiUsageReportSchema>;

/**
 * Emite un evento de sincronizacion para el medico con `seq` monotono.
 * La unicidad (doctorId, seq) resuelve carreras: si dos emisores calculan el
 * mismo seq, uno falla con P2002 y reintenta con el siguiente.
 */
export async function emitSyncEvent(
  doctorId: string,
  type: SyncEventType,
  payload: Prisma.InputJsonValue
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await prisma.syncEvent.findFirst({
      where: { doctorId },
      orderBy: { seq: "desc" },
      select: { seq: true }
    });

    try {
      return await prisma.syncEvent.create({
        data: {
          doctorId,
          seq: (last?.seq ?? 0) + 1,
          type,
          payload
        }
      });
    } catch (error) {
      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueViolation || attempt === 4) {
        throw error;
      }
    }
  }

  throw new SyncServiceError("No se pudo emitir el evento de sincronizacion.", 500);
}

/**
 * Valida una llave publica X25519 en base64 (32 bytes). El portal nunca la usa
 * para descifrar (no puede): solo la reenvia a la pagina de carga del paciente.
 */
function normalizeDocumentPublicKey(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  const decoded = Buffer.from(trimmed, "base64");
  // Re-encode y compara para rechazar base64 mal formado o longitud incorrecta.
  if (decoded.length !== 32 || decoded.toString("base64") !== trimmed) {
    throw new SyncServiceError("Llave publica de documentos invalida.", 400);
  }
  return trimmed;
}

/**
 * Vincula (o re-vincula) la app de escritorio del medico. Un dispositivo
 * activo por medico: vincular uno nuevo revoca el anterior.
 */
export async function linkSyncDevice(
  doctorUserId: string,
  deviceName?: string,
  documentPublicKey?: string
) {
  const doctor = await prisma.user.findUnique({ where: { id: doctorUserId } });

  if (!doctor || doctor.role !== UserRole.DOCTOR) {
    throw new SyncServiceError("Doctor account not found.", 404);
  }

  const normalizedKey = normalizeDocumentPublicKey(documentPublicKey);
  const deviceToken = generateOpaqueToken();

  const device = await prisma.$transaction(async (tx) => {
    await tx.syncDevice.updateMany({
      where: { doctorId: doctorUserId, status: SyncDeviceStatus.ACTIVE },
      data: { status: SyncDeviceStatus.REVOKED, revokedAt: new Date() }
    });

    return tx.syncDevice.create({
      data: {
        doctorId: doctorUserId,
        tokenHash: hashOpaqueToken(deviceToken),
        deviceName: deviceName?.trim(),
        documentPublicKey: normalizedKey
      }
    });
  });

  await writeAuditLog({
    actorUserId: doctorUserId,
    entityType: "SyncDevice",
    entityId: device.id,
    action: "sync.device-linked",
    source: "sync-service",
    metadata: { deviceName: device.deviceName, hasDocumentKey: Boolean(normalizedKey) }
  });

  return { device, deviceToken };
}

/**
 * Llave publica de documentos del dispositivo activo del medico (null si no hay
 * dispositivo vinculado o aun no publico una llave). La usa la carga de
 * documentos del paciente para cifrar con sealed box.
 */
export async function getActiveDeviceDocumentKey(doctorId: string): Promise<string | null> {
  const device = await prisma.syncDevice.findFirst({
    where: { doctorId, status: SyncDeviceStatus.ACTIVE },
    orderBy: { createdAt: "desc" },
    select: { documentPublicKey: true }
  });

  return device?.documentPublicKey ?? null;
}

/**
 * Metadatos del perfil del medico para un dispositivo autenticado por token
 * (no sesion): especialidad, duracion de cita y reglas de disponibilidad
 * activas. La app de escritorio los usa para refrescar, en cada sincronizacion,
 * el perfil clinico, el tamano de bloque y el horario laboral de la agenda. No
 * incluye contenido clinico. Mismo shape que `/api/admin/profile` (campo
 * `profile`) para reutilizar los extractores de la app.
 */
export async function getSyncDeviceProfile(device: SyncDevice) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: device.doctorId },
    select: {
      specialty: true,
      consultationDuration: true,
      availabilityRules: {
        where: { isActive: true },
        select: { startTime: true, endTime: true, isActive: true }
      }
    }
  });

  return { profile };
}

/** Resuelve el dispositivo activo a partir del header Authorization. */
export async function authenticateSyncDevice(request: Request): Promise<SyncDevice> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;

  if (!token) {
    throw new SyncServiceError("No autorizado.", 401);
  }

  const device = await prisma.syncDevice.findUnique({
    where: { tokenHash: hashOpaqueToken(token) }
  });

  if (!device || device.status !== SyncDeviceStatus.ACTIVE) {
    throw new SyncServiceError("No autorizado.", 401);
  }

  return device;
}

export async function getSyncInbox(device: SyncDevice, cursor: number) {
  const events = await prisma.syncEvent.findMany({
    where: {
      doctorId: device.doctorId,
      seq: { gt: cursor }
    },
    orderBy: { seq: "asc" },
    take: INBOX_BATCH_SIZE,
    select: {
      seq: true,
      type: true,
      payload: true,
      createdAt: true
    }
  });

  return {
    events,
    nextCursor: events.length > 0 ? events[events.length - 1]!.seq : cursor
  };
}

/**
 * Confirma la entrega hasta `cursor` y purga el contenido clinico de los
 * eventos entregados (frontera legal del contrato: tras el ACK, el dato
 * clinico solo existe en el equipo del medico).
 */
export async function ackSyncEvents(device: SyncDevice, cursor: number) {
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new SyncServiceError("Cursor invalido.");
  }

  const now = new Date();

  // Eventos con contenido clinico en transito que deben purgarse al confirmar:
  // preconsultas y documentos del buzon.
  const clinicalEvents = await prisma.syncEvent.findMany({
    where: {
      doctorId: device.doctorId,
      seq: { lte: cursor },
      type: { in: [SyncEventType.PRECHECKIN_SUBMITTED, SyncEventType.DOCUMENT_UPLOADED] },
      purgedAt: null
    },
    select: { id: true, type: true, payload: true }
  });

  const precheckinIds: string[] = [];
  const mailboxDocumentIds: string[] = [];

  for (const event of clinicalEvents) {
    if (event.type === SyncEventType.PRECHECKIN_SUBMITTED) {
      const payload = event.payload as { precheckinId?: string } | null;
      if (payload?.precheckinId) {
        precheckinIds.push(payload.precheckinId);
      }
    } else if (event.type === SyncEventType.DOCUMENT_UPLOADED) {
      const payload = event.payload as { mailboxDocumentId?: string } | null;
      if (payload?.mailboxDocumentId) {
        mailboxDocumentIds.push(payload.mailboxDocumentId);
      }
    }
  }

  await prisma.$transaction([
    prisma.syncEvent.updateMany({
      where: {
        doctorId: device.doctorId,
        seq: { lte: cursor },
        deliveredAt: null
      },
      data: { deliveredAt: now }
    }),
    // Purga: el payload clinico desaparece del evento...
    prisma.syncEvent.updateMany({
      where: {
        id: { in: clinicalEvents.map((event) => event.id) }
      },
      data: { payload: Prisma.DbNull, purgedAt: now }
    }),
    // ...y del buzon (las respuestas de preconsulta se vacian en nube)...
    prisma.precheckinSubmission.updateMany({
      where: { id: { in: precheckinIds } },
      data: { responses: {} }
    }),
    // ...y el ciphertext de los documentos se elimina (frontera legal: tras el
    // ACK el documento solo existe en el equipo del medico).
    prisma.mailboxDocument.updateMany({
      where: { id: { in: mailboxDocumentIds } },
      data: {
        ciphertext: null,
        status: MailboxDocumentStatus.PURGED,
        deliveredAt: now,
        purgedAt: now
      }
    }),
    prisma.syncDevice.update({
      where: { id: device.id },
      data: {
        cursor: Math.max(device.cursor, cursor),
        lastSyncAt: now
      }
    })
  ]);

  if (precheckinIds.length > 0 || mailboxDocumentIds.length > 0) {
    await writeAuditLog({
      actorUserId: device.doctorId,
      entityType: "SyncEvent",
      entityId: device.id,
      action: "sync.clinical-content-purged",
      source: "sync-service",
      metadata: {
        purgedPrecheckins: precheckinIds.length,
        purgedDocuments: mailboxDocumentIds.length,
        cursor
      }
    });
  }

  return { acknowledged: cursor, purgedClinicalEvents: clinicalEvents.length };
}

/**
 * Devuelve el ciphertext (sealed box) de un documento del buzon para el
 * dispositivo del medico. Solo el dueño del documento puede descargarlo, y solo
 * mientras no se haya purgado. La nube no puede descifrarlo.
 */
export async function getMailboxDocumentForDevice(device: SyncDevice, documentId: string) {
  const document = await prisma.mailboxDocument.findFirst({
    where: { id: documentId, doctorId: device.doctorId },
    select: { id: true, ciphertext: true, sizeBytes: true, status: true }
  });

  if (!document) {
    throw new SyncServiceError("Documento no encontrado.", 404);
  }

  if (!document.ciphertext || document.status === MailboxDocumentStatus.PURGED) {
    // Ya entregado y purgado: el dispositivo lo re-pide tras un ACK perdido.
    throw new SyncServiceError("Documento ya entregado.", 410);
  }

  return {
    id: document.id,
    sizeBytes: document.sizeBytes,
    ciphertext: Buffer.from(document.ciphertext).toString("base64")
  };
}

function mapAiUsageType(usageType: AiUsageReport["usageType"]): AiUsageType {
  const mapping: Record<AiUsageReport["usageType"], AiUsageType> = {
    SOAP_ASSIST: AiUsageType.SOAP_SUMMARY,
    LONGITUDINAL_SUMMARY: AiUsageType.LONGITUDINAL_SUMMARY,
    PATIENT_INSTRUCTIONS: AiUsageType.PATIENT_INSTRUCTIONS,
    CLINICAL_GAPS: AiUsageType.CLINICAL_GAP,
    TRANSCRIPTION: AiUsageType.TRANSCRIPTION,
    VALIDATION: AiUsageType.VALIDATION,
    OTHER: AiUsageType.OTHER
  };
  return mapping[usageType];
}

function mapAiUsageStatus(status: AiUsageReport["status"]): AiUsageStatus {
  const mapping: Record<AiUsageReport["status"], AiUsageStatus> = {
    DRAFT: AiUsageStatus.PENDING,
    APPROVED: AiUsageStatus.REVIEWED,
    DISCARDED: AiUsageStatus.REJECTED,
    FAILED: AiUsageStatus.FAILED
  };
  return mapping[status];
}

async function getOrCreateAiProvider(report: AiUsageReport) {
  const providerType = AiProviderType[report.providerType];
  const existing = await prisma.aiProvider.findFirst({
    where: {
      name: report.providerName,
      providerType,
      modelName: report.modelVersion ?? null
    }
  });

  if (existing) {
    return existing;
  }

  return prisma.aiProvider.create({
    data: {
      name: report.providerName,
      providerType,
      modelName: report.modelVersion
    }
  });
}

/**
 * Registra en el portal solo metadatos de uso de IA para gobernanza/creditos.
 * El contenido clinico, prompts y salidas permanecen en la app local; las
 * referencias apuntan a IDs locales que el portal no puede resolver.
 */
export async function recordAiUsageBatch(device: SyncDevice, payload: unknown) {
  const parsedResult = aiUsageBatchSchema.safeParse(payload);
  if (!parsedResult.success) {
    throw new SyncServiceError("Datos invalidos.", 400);
  }
  const parsed = parsedResult.data;
  const now = new Date();

  for (const report of parsed.runs) {
    const provider = await getOrCreateAiProvider(report);
    const status = mapAiUsageStatus(report.status);
    const reviewedAt = status === AiUsageStatus.REVIEWED || status === AiUsageStatus.REJECTED
      ? now
      : null;

    await prisma.aiUsageLog.upsert({
      where: {
        doctorId_externalRunId: {
          doctorId: device.doctorId,
          externalRunId: report.externalRunId
        }
      },
      create: {
        doctorId: device.doctorId,
        externalRunId: report.externalRunId,
        providerId: provider.id,
        usageType: mapAiUsageType(report.usageType),
        status,
        inputReference: report.inputReference,
        outputReference: report.outputReference,
        promptVersion: report.promptVersion,
        modelVersion: report.modelVersion,
        estimatedCostCents: report.estimatedCostCents,
        latencyMs: report.latencyMs,
        reviewedAt,
        reportedAt: now,
        createdAt: new Date(report.occurredAt)
      },
      update: {
        providerId: provider.id,
        usageType: mapAiUsageType(report.usageType),
        status,
        inputReference: report.inputReference,
        outputReference: report.outputReference,
        promptVersion: report.promptVersion,
        modelVersion: report.modelVersion,
        estimatedCostCents: report.estimatedCostCents,
        latencyMs: report.latencyMs,
        reviewedAt,
        reportedAt: now
      }
    });
  }

  await writeAuditLog({
    actorUserId: device.doctorId,
    entityType: "AiUsageLog",
    entityId: device.id,
    action: "sync.ai-usage-reported",
    source: "sync-service",
    metadata: { runCount: parsed.runs.length }
  });

  return { reported: parsed.runs.length };
}
