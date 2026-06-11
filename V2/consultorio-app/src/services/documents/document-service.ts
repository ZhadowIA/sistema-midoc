import {
  DocumentCategory,
  MailboxDocumentStatus,
  Prisma,
  UploadLinkStatus
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { env } from "../../lib/env";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { generateOpaqueToken } from "../../lib/security/token";
import { emitSyncEvent, getActiveDeviceDocumentKey } from "../sync/sync-service";

class DocumentServiceError extends ServiceError {}

/** Prisma error code for serialization failures (serializable tx aborted). */
const SERIALIZATION_FAILURE = "P2034";

// Limites del buzon. El ciphertext es un sealed box; el archivo en claro se
// limita en el cliente. El servidor solo confia en el tamaño del ciphertext.
const MAX_CIPHERTEXT_BYTES = 12 * 1024 * 1024;
const MIN_CIPHERTEXT_BYTES = 49; // 32 (epk) + 16 (mac) + 1 byte de contenido.
const DEFAULT_EXPIRES_HOURS = 72;
const MAX_EXPIRES_HOURS = 24 * 30; // 30 dias (TTL maximo del buzon, contrato 13).
const DEFAULT_MAX_UPLOADS = 5;
const MAX_MAX_UPLOADS = 20;

async function runSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const isSerialization =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === SERIALIZATION_FAILURE;
      if (isSerialization && attempt < 3) {
        continue;
      }
      throw error;
    }
  }
}

async function assertPatientOwnedByDoctor(doctorUserId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ownerDoctorId: doctorUserId },
    select: { id: true }
  });

  if (!patient) {
    throw new DocumentServiceError("Paciente no encontrado.", 404);
  }
}

/**
 * El medico crea un enlace temporal para que el paciente suba documentos al
 * buzon cifrado. El enlace tiene expiracion, tope de subidas y auditoria.
 */
export async function createUploadLink(
  doctorUserId: string,
  input: {
    patientId: string;
    appointmentId?: string;
    expiresInHours?: number;
    maxUploads?: number;
  }
) {
  await assertPatientOwnedByDoctor(doctorUserId, input.patientId);

  if (input.appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: input.appointmentId, doctorId: doctorUserId, patientId: input.patientId },
      select: { id: true }
    });
    if (!appointment) {
      throw new DocumentServiceError("Cita no encontrada para este paciente.", 404);
    }
  }

  const expiresInHours = Math.min(
    Math.max(input.expiresInHours ?? DEFAULT_EXPIRES_HOURS, 1),
    MAX_EXPIRES_HOURS
  );
  const maxUploads = Math.min(Math.max(input.maxUploads ?? DEFAULT_MAX_UPLOADS, 1), MAX_MAX_UPLOADS);
  const token = generateOpaqueToken(20);

  const link = await prisma.documentUploadLink.create({
    data: {
      doctorId: doctorUserId,
      patientId: input.patientId,
      appointmentId: input.appointmentId,
      token,
      status: UploadLinkStatus.ACTIVE,
      expiresAt: new Date(Date.now() + expiresInHours * 3_600_000),
      maxUploads
    }
  });

  await writeAuditLog({
    actorUserId: doctorUserId,
    entityType: "DocumentUploadLink",
    entityId: link.id,
    action: "document.upload-link-created",
    source: "document-service",
    metadata: { patientId: input.patientId, appointmentId: input.appointmentId ?? null, maxUploads }
  });

  return {
    link,
    uploadUrl: `${env.APP_BASE_URL}/carga/${token}`
  };
}

export async function listUploadLinks(doctorUserId: string, patientId?: string) {
  return prisma.documentUploadLink.findMany({
    where: { doctorId: doctorUserId, ...(patientId ? { patientId } : {}) },
    orderBy: { createdAt: "desc" }
  });
}

export async function revokeUploadLink(doctorUserId: string, linkId: string) {
  const link = await prisma.documentUploadLink.findFirst({
    where: { id: linkId, doctorId: doctorUserId },
    select: { id: true, status: true }
  });

  if (!link) {
    throw new DocumentServiceError("Enlace no encontrado.", 404);
  }

  const updated = await prisma.documentUploadLink.update({
    where: { id: link.id },
    data: { status: UploadLinkStatus.REVOKED, revokedAt: new Date() }
  });

  await writeAuditLog({
    actorUserId: doctorUserId,
    entityType: "DocumentUploadLink",
    entityId: link.id,
    action: "document.upload-link-revoked",
    source: "document-service"
  });

  return updated;
}

function assertLinkUsable(link: {
  status: UploadLinkStatus;
  expiresAt: Date;
  uploadCount: number;
  maxUploads: number;
}) {
  if (link.status === UploadLinkStatus.REVOKED) {
    throw new DocumentServiceError("Este enlace fue revocado.", 410);
  }
  if (link.status === UploadLinkStatus.EXPIRED || link.expiresAt <= new Date()) {
    throw new DocumentServiceError("Este enlace expiro.", 410);
  }
  if (link.status === UploadLinkStatus.USED || link.uploadCount >= link.maxUploads) {
    throw new DocumentServiceError("Este enlace ya alcanzo su limite de subidas.", 410);
  }
}

/**
 * Resuelve un enlace para la pagina de carga del paciente: devuelve la llave
 * publica del medico (para cifrar) y datos minimos de contexto. No expone
 * informacion clinica.
 */
export async function getUploadLinkForUpload(token: string) {
  const link = await prisma.documentUploadLink.findUnique({
    where: { token },
    include: { patient: { select: { firstName: true } } }
  });

  if (!link) {
    throw new DocumentServiceError("Enlace no encontrado.", 404);
  }

  assertLinkUsable(link);

  const documentPublicKey = await getActiveDeviceDocumentKey(link.doctorId);

  if (!documentPublicKey) {
    // Sin llave publica no se puede cifrar de extremo a extremo: la app del
    // medico aun no se ha vinculado. No se permite subir en claro.
    throw new DocumentServiceError(
      "El consultorio aun no esta listo para recibir documentos cifrados.",
      409
    );
  }

  return {
    patientFirstName: link.patient.firstName,
    documentPublicKey,
    maxUploads: link.maxUploads,
    uploadCount: link.uploadCount,
    expiresAt: link.expiresAt
  };
}

/**
 * Recibe un documento cifrado (sealed box) por un enlace temporal y lo deja en
 * el buzon. El contenido es opaco para la nube. Emite un evento de sync para
 * que la app del medico lo descargue, descifre y luego se purgue (Fase B).
 */
export async function submitMailboxDocument(token: string, input: { ciphertext: Buffer }) {
  if (input.ciphertext.length < MIN_CIPHERTEXT_BYTES) {
    throw new DocumentServiceError("Documento cifrado invalido.", 400);
  }
  if (input.ciphertext.length > MAX_CIPHERTEXT_BYTES) {
    throw new DocumentServiceError("El documento excede el tamaño maximo permitido.", 413);
  }

  const sizeBytes = input.ciphertext.length;

  // Transaccion serializable: dos subidas concurrentes no pueden rebasar el
  // tope del enlace (uploadCount no excede maxUploads).
  const { document, doctorId, patientId, appointmentId } = await runSerializable(async (tx) => {
    const link = await tx.documentUploadLink.findUnique({ where: { token } });

    if (!link) {
      throw new DocumentServiceError("Enlace no encontrado.", 404);
    }

    assertLinkUsable(link);

    const createdDocument = await tx.mailboxDocument.create({
      data: {
        doctorId: link.doctorId,
        patientId: link.patientId,
        appointmentId: link.appointmentId,
        uploadLinkId: link.id,
        // La categoria real viaja cifrada dentro del sealed box; la nube solo
        // guarda un marcador. El medico la reclasifica al descargar en su app.
        category: DocumentCategory.OTHER,
        // Copia a un Uint8Array respaldado por ArrayBuffer (tipo que espera
        // Prisma para Bytes); el contenido sigue siendo opaco.
        ciphertext: new Uint8Array(input.ciphertext),
        sizeBytes,
        status: MailboxDocumentStatus.PENDING
      },
      select: { id: true }
    });

    const nextCount = link.uploadCount + 1;
    await tx.documentUploadLink.update({
      where: { id: link.id },
      data: {
        uploadCount: nextCount,
        status: nextCount >= link.maxUploads ? UploadLinkStatus.USED : link.status
      }
    });

    return {
      document: createdDocument,
      doctorId: link.doctorId,
      patientId: link.patientId,
      appointmentId: link.appointmentId
    };
  });

  // Evento de sync: solo referencias y tamaño, nunca contenido clinico (la
  // categoria y el nombre del archivo viajan cifrados dentro del sealed box).
  await emitSyncEvent(doctorId, "DOCUMENT_UPLOADED", {
    mailboxDocumentId: document.id,
    patientId,
    appointmentId: appointmentId ?? null,
    sizeBytes
  });

  await writeAuditLog({
    entityType: "MailboxDocument",
    entityId: document.id,
    action: "document.mailbox-uploaded",
    source: "document-service",
    metadata: { doctorId, patientId, sizeBytes }
  });

  return { id: document.id };
}
