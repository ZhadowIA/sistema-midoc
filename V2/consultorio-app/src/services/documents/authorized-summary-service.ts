import { AuthorizedSummaryStatus, type SyncDevice } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { env } from "../../lib/env";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { generateOpaqueToken } from "../../lib/security/token";

class AuthorizedSummaryError extends ServiceError {}

const MAX_CIPHERTEXT_BYTES = 12 * 1024 * 1024;
const MIN_CIPHERTEXT_BYTES = 25; // nonce(24) + al menos 1 byte de contenido.
const DEFAULT_EXPIRES_HOURS = 24 * 7;
const MAX_EXPIRES_HOURS = 24 * 30;

/**
 * El medico publica (app -> nube, via device token) un resumen cifrado para el
 * paciente. La nube guarda solo ciphertext: la llave viaja en el fragmento del
 * enlace y nunca llega al servidor.
 */
export async function publishAuthorizedSummary(
  device: SyncDevice,
  input: {
    patientId: string;
    appointmentId?: string;
    ciphertext: Buffer;
    title?: string;
    mimeType?: string;
    expiresInHours?: number;
  }
) {
  if (input.ciphertext.length < MIN_CIPHERTEXT_BYTES) {
    throw new AuthorizedSummaryError("Resumen cifrado invalido.", 400);
  }
  if (input.ciphertext.length > MAX_CIPHERTEXT_BYTES) {
    throw new AuthorizedSummaryError("El resumen excede el tamaño maximo permitido.", 413);
  }

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, ownerDoctorId: device.doctorId },
    select: { id: true }
  });
  if (!patient) {
    throw new AuthorizedSummaryError("Paciente no encontrado.", 404);
  }

  if (input.appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: input.appointmentId, doctorId: device.doctorId, patientId: input.patientId },
      select: { id: true }
    });
    if (!appointment) {
      throw new AuthorizedSummaryError("Cita no encontrada para este paciente.", 404);
    }
  }

  const expiresInHours = Math.min(
    Math.max(input.expiresInHours ?? DEFAULT_EXPIRES_HOURS, 1),
    MAX_EXPIRES_HOURS
  );
  const token = generateOpaqueToken(20);

  const summary = await prisma.authorizedSummary.create({
    data: {
      doctorId: device.doctorId,
      patientId: input.patientId,
      appointmentId: input.appointmentId,
      token,
      ciphertext: new Uint8Array(input.ciphertext),
      mimeType: input.mimeType ?? "application/pdf",
      title: input.title?.trim() || null,
      sizeBytes: input.ciphertext.length,
      status: AuthorizedSummaryStatus.ACTIVE,
      expiresAt: new Date(Date.now() + expiresInHours * 3_600_000)
    },
    select: { id: true, token: true, expiresAt: true }
  });

  await writeAuditLog({
    actorUserId: device.doctorId,
    entityType: "AuthorizedSummary",
    entityId: summary.id,
    action: "summary.published",
    source: "authorized-summary-service",
    metadata: { patientId: input.patientId, appointmentId: input.appointmentId ?? null }
  });

  return {
    id: summary.id,
    token: summary.token,
    expiresAt: summary.expiresAt,
    // El enlace final lo arma la app agregando la llave en el fragmento:
    //   {downloadUrl}#k=<llave base64url>
    downloadUrl: `${env.APP_BASE_URL}/resumen/${summary.token}`
  };
}

async function expireIfNeeded(summary: {
  id: string;
  status: AuthorizedSummaryStatus;
  expiresAt: Date;
}) {
  if (summary.status === AuthorizedSummaryStatus.ACTIVE && summary.expiresAt <= new Date()) {
    await prisma.authorizedSummary.update({
      where: { id: summary.id },
      data: { status: AuthorizedSummaryStatus.EXPIRED, ciphertext: null, purgedAt: new Date() }
    });
    return AuthorizedSummaryStatus.EXPIRED;
  }
  return summary.status;
}

/**
 * Entrega el ciphertext del resumen al paciente (la nube no puede abrirlo). El
 * acceso queda auditado; un enlace vencido se purga y se rechaza.
 */
export async function getAuthorizedSummaryForDownload(
  token: string,
  context?: { ipAddress?: string }
) {
  const summary = await prisma.authorizedSummary.findUnique({ where: { token } });

  if (!summary) {
    throw new AuthorizedSummaryError("Resumen no encontrado.", 404);
  }

  const status = await expireIfNeeded(summary);

  if (status !== AuthorizedSummaryStatus.ACTIVE || !summary.ciphertext) {
    throw new AuthorizedSummaryError("Este resumen ya no esta disponible.", 410);
  }

  await prisma.authorizedSummary.update({
    where: { id: summary.id },
    data: { downloadCount: { increment: 1 } }
  });

  await writeAuditLog({
    entityType: "AuthorizedSummary",
    entityId: summary.id,
    action: "summary.downloaded",
    source: "authorized-summary-service",
    metadata: { patientId: summary.patientId, ipAddress: context?.ipAddress ?? null }
  });

  return {
    title: summary.title,
    mimeType: summary.mimeType,
    sizeBytes: summary.sizeBytes,
    ciphertext: Buffer.from(summary.ciphertext).toString("base64")
  };
}

export async function revokeAuthorizedSummary(device: SyncDevice, summaryId: string) {
  const summary = await prisma.authorizedSummary.findFirst({
    where: { id: summaryId, doctorId: device.doctorId },
    select: { id: true }
  });
  if (!summary) {
    throw new AuthorizedSummaryError("Resumen no encontrado.", 404);
  }

  const updated = await prisma.authorizedSummary.update({
    where: { id: summary.id },
    data: {
      status: AuthorizedSummaryStatus.REVOKED,
      ciphertext: null,
      revokedAt: new Date(),
      purgedAt: new Date()
    }
  });

  await writeAuditLog({
    actorUserId: device.doctorId,
    entityType: "AuthorizedSummary",
    entityId: summary.id,
    action: "summary.revoked",
    source: "authorized-summary-service"
  });

  return { id: updated.id, status: updated.status };
}
