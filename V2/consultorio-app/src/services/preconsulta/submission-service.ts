import { PreconsultaLinkKind, PreconsultaLinkStatus, SyncEventType } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { ServiceError } from "../../lib/errors";
import { preconsultaQuestionnaireSchema, type PreconsultaQuestionnaire } from "../../lib/preconsulta-questionnaire";
import { prisma } from "../../lib/prisma";
import { assertRateLimit } from "../../lib/rate-limit";
import { hashOpaqueToken } from "../../lib/security/token";
import { emitSyncEvent, getActiveDeviceDocumentKey } from "../sync/sync-service";

/**
 * Preconsulta configurable, rebanada 2 (paso 32): el formulario publico y el
 * deposito de respuestas. El portal solo recibe el sobre sellado en el celular
 * del paciente para la llave del medico; no puede abrirlo. Se guarda en
 * `PreconsultaSubmission` (CLINICO en transito) hasta que la app lo descargue.
 */

/** Tope de un envio ya sellado (antecedentes completos caben de sobra). */
export const MAX_SUBMISSION_BYTES = 192 * 1024;
/** Tope de preconsultas sin descargar por medico, contra el abuso del enlace general. */
export const MAX_PENDING_SUBMISSIONS = 500;

export interface PublicPreconsulta {
  doctorName: string;
  licenseNumber: string | null;
  /** El formulario acepta envios: enlace activo, cuestionario publicado y llave del medico. */
  accepting: boolean;
  /** Por que no acepta, para decirselo al paciente. */
  reason: "paused" | "not-ready" | "expired" | "used" | null;
  /** General (cualquiera lo contesta) o personal (un paciente, un envio). */
  linkKind: "GENERAL" | "PERSONAL";
  questionnaire: { version: number; definition: PreconsultaQuestionnaire } | null;
  /** Llave publica X25519 del equipo del medico, para sellar en el navegador. */
  publicKey: string | null;
}

async function findLink(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const link = await prisma.preconsultaLink.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
  if (!link || link.status === PreconsultaLinkStatus.REVOKED) return null;
  return link;
}

/** Un enlace personal (rebanada 4) sirve 30 dias y para un solo envio. */
function personalLinkState(
  link: { kind: PreconsultaLinkKind; expiresAt: Date | null; usedAt: Date | null },
  now = new Date()
): "expired" | "used" | null {
  if (link.kind !== PreconsultaLinkKind.PERSONAL) return null;
  if (link.usedAt) return "used";
  if (!link.expiresAt || link.expiresAt.getTime() <= now.getTime()) return "expired";
  return null;
}

/** Lo que necesita la pagina publica; `null` si el enlace no existe o se regenero. */
export async function getPublicPreconsulta(token: string): Promise<PublicPreconsulta | null> {
  const link = await findLink(token);
  if (!link) return null;
  const [profile, questionnaire, publicKey] = await Promise.all([
    prisma.doctorProfile.findUnique({
      where: { userId: link.doctorId },
      select: { professionalName: true, licenseNumber: true }
    }),
    prisma.preconsultaQuestionnaire.findUnique({ where: { doctorId: link.doctorId } }),
    getActiveDeviceDocumentKey(link.doctorId)
  ]);
  if (!profile) return null;
  const parsed = questionnaire ? preconsultaQuestionnaireSchema.safeParse(questionnaire.definition) : null;
  const ready = Boolean(parsed?.success && publicKey);
  const paused = link.status === PreconsultaLinkStatus.PAUSED;
  const personal = personalLinkState(link);
  return {
    doctorName: profile.professionalName,
    licenseNumber: profile.licenseNumber,
    accepting: ready && !paused && !personal,
    reason: personal ?? (paused ? "paused" : ready ? null : "not-ready"),
    linkKind: link.kind === PreconsultaLinkKind.PERSONAL ? "PERSONAL" : "GENERAL",
    questionnaire: questionnaire && parsed?.success ? { version: questionnaire.version, definition: parsed.data } : null,
    publicKey
  };
}

/**
 * Guarda un envio sellado. Limites contra abuso del enlace general (diseno,
 * seccion 7): por red y por enlace, tamano maximo y tope de pendientes.
 */
export async function submitPreconsulta(input: {
  token: string;
  ciphertext: string;
  questionnaireVersion: number;
  ip?: string;
}): Promise<{ id: string }> {
  const link = await findLink(input.token);
  if (!link) throw new ServiceError("Este enlace ya no existe. Pide a tu médico el enlace vigente.", 404);
  if (link.status === PreconsultaLinkStatus.PAUSED) {
    throw new ServiceError("Tu médico pausó por ahora la recepción de preconsultas. Intenta más tarde.", 409);
  }
  const personal = personalLinkState(link);
  if (personal === "used") throw new ServiceError("Este enlace ya se usó. Si necesitas cambiar algo, pide otro a tu médico.", 409);
  if (personal === "expired") throw new ServiceError("Este enlace venció. Pide uno nuevo a tu médico.", 410);

  await assertRateLimit({ key: `preconsulta-submit-ip:${input.ip ?? "desconocida"}`, limit: 5, windowMs: 60 * 60 * 1000 });
  await assertRateLimit({ key: `preconsulta-submit-link:${link.id}`, limit: 300, windowMs: 24 * 60 * 60 * 1000 });

  let bytes: Buffer;
  try {
    bytes = Buffer.from(input.ciphertext, "base64");
  } catch {
    throw new ServiceError("Envio invalido.", 400);
  }
  // Un sealed box tiene al menos 48 bytes de cabecera (llave efimera + MAC).
  if (bytes.length < 48 || bytes.toString("base64") !== input.ciphertext.replace(/\s/g, "")) {
    throw new ServiceError("Envio invalido.", 400);
  }
  if (bytes.length > MAX_SUBMISSION_BYTES) throw new ServiceError("El envio es demasiado grande.", 413);

  const questionnaire = await prisma.preconsultaQuestionnaire.findUnique({ where: { doctorId: link.doctorId } });
  if (!questionnaire) throw new ServiceError("Tu médico aún no publica su preconsulta.", 409);
  if (input.questionnaireVersion < 1 || input.questionnaireVersion > questionnaire.version) {
    throw new ServiceError("Envio invalido.", 400);
  }

  const pending = await prisma.preconsultaSubmission.count({ where: { doctorId: link.doctorId, purgedAt: null } });
  if (pending >= MAX_PENDING_SUBMISSIONS) {
    throw new ServiceError("Tu médico tiene demasiadas preconsultas por revisar. Intenta más tarde.", 429);
  }

  const submission = await prisma.$transaction(async (tx) => {
    if (link.kind === PreconsultaLinkKind.PERSONAL) {
      // Un solo envio: si dos llegan a la vez, solo uno marca el enlace.
      const claimed = await tx.preconsultaLink.updateMany({
        where: { id: link.id, usedAt: null },
        data: { usedAt: new Date() }
      });
      if (claimed.count !== 1) {
        throw new ServiceError("Este enlace ya se usó. Si necesitas cambiar algo, pide otro a tu médico.", 409);
      }
    }
    return tx.preconsultaSubmission.create({
      data: {
        doctorId: link.doctorId,
        linkId: link.id,
        questionnaireVersion: input.questionnaireVersion,
        ciphertext: new Uint8Array(bytes),
        sizeBytes: bytes.length
      }
    });
  });
  // Aviso en el buzon de la app (rebanada 3): solo el id, el sobre se baja
  // aparte. Sin aviso la app nunca lo veria, asi que el envio no queda a medias.
  // El enlace personal agrega la referencia opaca con la que la app reconoce
  // al paciente (rebanada 4); nunca su nombre.
  try {
    await emitSyncEvent(link.doctorId, SyncEventType.PRECONSULTA_SUBMITTED, {
      preconsultaSubmissionId: submission.id,
      sealed: true,
      ...(link.patientRef ? { patientRef: link.patientRef } : {})
    });
  } catch (error) {
    await prisma.preconsultaSubmission.delete({ where: { id: submission.id } });
    if (link.kind === PreconsultaLinkKind.PERSONAL) {
      await prisma.preconsultaLink.update({ where: { id: link.id }, data: { usedAt: null } });
    }
    throw error;
  }
  // Por referencia: ni nombre, ni respuestas, ni IP en claro.
  await writeAuditLog({
    entityType: "PreconsultaSubmission",
    entityId: submission.id,
    action: "preconsulta.submitted",
    source: "public",
    metadata: { linkKind: link.kind, questionnaireVersion: input.questionnaireVersion, sizeBytes: bytes.length }
  });
  return { id: submission.id };
}
