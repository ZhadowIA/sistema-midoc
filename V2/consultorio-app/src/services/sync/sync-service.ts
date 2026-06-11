import {
  Prisma,
  SyncDeviceStatus,
  SyncEventType,
  UserRole,
  type SyncDevice
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { generateOpaqueToken, hashOpaqueToken } from "../../lib/security/token";

const INBOX_BATCH_SIZE = 100;

class SyncServiceError extends ServiceError {}

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

  const clinicalEvents = await prisma.syncEvent.findMany({
    where: {
      doctorId: device.doctorId,
      seq: { lte: cursor },
      type: SyncEventType.PRECHECKIN_SUBMITTED,
      purgedAt: null
    },
    select: { id: true, payload: true }
  });

  const precheckinIds = clinicalEvents
    .map((event) => {
      const payload = event.payload as { precheckinId?: string } | null;
      return payload?.precheckinId;
    })
    .filter((id): id is string => Boolean(id));

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
    // ...y del buzon (las respuestas de preconsulta se vacian en nube).
    prisma.precheckinSubmission.updateMany({
      where: { id: { in: precheckinIds } },
      data: { responses: {} }
    }),
    prisma.syncDevice.update({
      where: { id: device.id },
      data: {
        cursor: Math.max(device.cursor, cursor),
        lastSyncAt: now
      }
    })
  ]);

  if (precheckinIds.length > 0) {
    await writeAuditLog({
      actorUserId: device.doctorId,
      entityType: "SyncEvent",
      entityId: device.id,
      action: "sync.clinical-content-purged",
      source: "sync-service",
      metadata: { purgedPrecheckins: precheckinIds.length, cursor }
    });
  }

  return { acknowledged: cursor, purgedClinicalEvents: clinicalEvents.length };
}
