import { PreconsultaLinkKind, PreconsultaLinkStatus, Prisma } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { env } from "../../lib/env";
import { ServiceError } from "../../lib/errors";
import { preconsultaQuestionnaireSchema, type PreconsultaQuestionnaire } from "../../lib/preconsulta-questionnaire";
import { prisma } from "../../lib/prisma";
import { generateOpaqueToken, hashOpaqueToken } from "../../lib/security/token";

/**
 * Preconsulta configurable, rebanada 1 (paso 32): el medico publica desde su app
 * la definicion de la parte 2 del cuestionario y administra su enlace general.
 *
 * Todo aqui es OPERATIVO: preguntas y enlaces, nunca respuestas. El token del
 * enlace solo se devuelve al crearlo (la app lo guarda); el portal guarda su hash.
 */

export interface GeneralLinkStatus {
  status: "ACTIVE" | "PAUSED";
  createdAt: string;
}

export interface PreconsultaStatus {
  questionnaire: { version: number; publishedAt: string; definition: PreconsultaQuestionnaire } | null;
  generalLink: GeneralLinkStatus | null;
}

export interface NewGeneralLink extends GeneralLinkStatus {
  /** URL que el medico comparte; solo se entrega al crear o regenerar el enlace. */
  url: string;
}

/** Ruta publica del formulario (rebanada 2). */
export function preconsultaUrl(token: string): string {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/preconsulta/${token}`;
}

async function currentGeneralLink(doctorId: string) {
  return prisma.preconsultaLink.findFirst({
    where: { doctorId, kind: PreconsultaLinkKind.GENERAL, status: { not: PreconsultaLinkStatus.REVOKED } },
    orderBy: { createdAt: "desc" }
  });
}

function linkStatus(link: { status: PreconsultaLinkStatus; createdAt: Date }): GeneralLinkStatus {
  return { status: link.status === PreconsultaLinkStatus.PAUSED ? "PAUSED" : "ACTIVE", createdAt: link.createdAt.toISOString() };
}

export async function getPreconsultaStatus(doctorId: string): Promise<PreconsultaStatus> {
  const [questionnaire, link] = await Promise.all([
    prisma.preconsultaQuestionnaire.findUnique({ where: { doctorId } }),
    currentGeneralLink(doctorId)
  ]);
  return {
    questionnaire: questionnaire
      ? {
          version: questionnaire.version,
          publishedAt: questionnaire.publishedAt.toISOString(),
          definition: preconsultaQuestionnaireSchema.parse(questionnaire.definition)
        }
      : null,
    generalLink: link ? linkStatus(link) : null
  };
}

/** Publica (o reemplaza) la definicion; cada publicacion sube la version. */
export async function publishQuestionnaire(doctorId: string, input: unknown) {
  const definition = preconsultaQuestionnaireSchema.parse(input);
  const json = definition as unknown as Prisma.InputJsonValue;
  const saved = await prisma.preconsultaQuestionnaire.upsert({
    where: { doctorId },
    create: { doctorId, definition: json },
    update: { definition: json, version: { increment: 1 }, publishedAt: new Date() }
  });
  await writeAuditLog({
    actorUserId: doctorId,
    entityType: "PreconsultaQuestionnaire",
    entityId: saved.id,
    action: "preconsulta.questionnaire.published",
    source: "desktop",
    metadata: { version: saved.version, questions: definition.questions.length }
  });
  return { version: saved.version, publishedAt: saved.publishedAt.toISOString() };
}

/**
 * Crea el enlace general o lo regenera: el anterior queda revocado y deja de
 * aceptar envios. Devuelve la URL una sola vez.
 */
export async function regenerateGeneralLink(doctorId: string): Promise<NewGeneralLink> {
  const token = generateOpaqueToken(24);
  const link = await prisma.$transaction(async (tx) => {
    const revoked = await tx.preconsultaLink.updateMany({
      where: { doctorId, kind: PreconsultaLinkKind.GENERAL, status: { not: PreconsultaLinkStatus.REVOKED } },
      data: { status: PreconsultaLinkStatus.REVOKED, revokedAt: new Date() }
    });
    const created = await tx.preconsultaLink.create({
      data: { doctorId, kind: PreconsultaLinkKind.GENERAL, tokenHash: hashOpaqueToken(token) }
    });
    return { created, replaced: revoked.count > 0 };
  });
  await writeAuditLog({
    actorUserId: doctorId,
    entityType: "PreconsultaLink",
    entityId: link.created.id,
    action: link.replaced ? "preconsulta.link.regenerated" : "preconsulta.link.created",
    source: "desktop"
  });
  return { ...linkStatus(link.created), url: preconsultaUrl(token) };
}

/** Dias que sirve un enlace personal (diseno, seccion 4). */
export const PERSONAL_LINK_DAYS = 30;

export interface NewPersonalLink {
  url: string;
  expiresAt: string;
}

/**
 * Enlace personal (rebanada 4): para un paciente concreto, sirve 30 dias y un
 * solo envio. `patientRef` es un id opaco que genera la app; el portal no sabe
 * de quien es. Devuelve la URL una sola vez.
 */
export async function createPersonalLink(doctorId: string, patientRef: string): Promise<NewPersonalLink> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(patientRef)) throw new ServiceError("Referencia invalida.", 400);
  const token = generateOpaqueToken(24);
  const expiresAt = new Date(Date.now() + PERSONAL_LINK_DAYS * 24 * 60 * 60 * 1000);
  const link = await prisma.preconsultaLink.create({
    data: { doctorId, kind: PreconsultaLinkKind.PERSONAL, tokenHash: hashOpaqueToken(token), patientRef, expiresAt }
  });
  await writeAuditLog({
    actorUserId: doctorId,
    entityType: "PreconsultaLink",
    entityId: link.id,
    action: "preconsulta.personal-link.created",
    source: "desktop"
  });
  return { url: preconsultaUrl(token), expiresAt: expiresAt.toISOString() };
}

/** Pausa o reanuda el enlace general sin cambiarlo. */
export async function setGeneralLinkStatus(doctorId: string, status: "ACTIVE" | "PAUSED"): Promise<GeneralLinkStatus> {
  const link = await currentGeneralLink(doctorId);
  if (!link) throw new ServiceError("Todavia no tienes enlace general.", 404);
  const updated = await prisma.preconsultaLink.update({
    where: { id: link.id },
    data: { status: status === "PAUSED" ? PreconsultaLinkStatus.PAUSED : PreconsultaLinkStatus.ACTIVE }
  });
  await writeAuditLog({
    actorUserId: doctorId,
    entityType: "PreconsultaLink",
    entityId: link.id,
    action: status === "PAUSED" ? "preconsulta.link.paused" : "preconsulta.link.resumed",
    source: "desktop"
  });
  return linkStatus(updated);
}
