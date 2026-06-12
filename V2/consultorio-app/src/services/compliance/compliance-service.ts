import {
  HoldStatus,
  IncidentSeverity,
  IncidentStatus,
  MailboxDocumentStatus,
  UploadLinkStatus,
  type Prisma
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

/** OPERATIVO: compliance del portal (incidentes, exportacion de auditoria, retencion). */
export class ComplianceServiceError extends ServiceError {}

// Ventanas de retencion del portal (alineadas con la limpieza del piloto, paso 9).
// La nube no guarda contenido clinico de forma permanente: el buzon se purga.
export const RETENTION_WINDOWS = {
  mailboxDocumentsDays: 30,
  authorizedSummaries: "hasta su expiracion explicita",
  appointmentHolds: "hasta expirar (minutos)",
  passwordResetTokens: "15 minutos",
  uploadLinks: "hasta expirar"
} as const;

export interface ReportIncidentInput {
  category: string;
  title: string;
  description: string;
  severity?: IncidentSeverity;
  detectedAt?: Date;
  metadata?: Prisma.InputJsonValue;
}

export async function reportIncident(doctorId: string, input: ReportIncidentInput) {
  const incident = await prisma.securityIncident.create({
    data: {
      doctorId,
      category: input.category,
      title: input.title,
      description: input.description,
      severity: input.severity ?? IncidentSeverity.MEDIUM,
      detectedAt: input.detectedAt ?? new Date(),
      metadata: input.metadata
    }
  });

  await writeAuditLog({
    actorUserId: doctorId,
    entityType: "SecurityIncident",
    entityId: incident.id,
    action: "doctor.incident.reported",
    source: "compliance-service",
    metadata: { category: incident.category, severity: incident.severity }
  });

  return incident;
}

export async function listIncidents(doctorId: string) {
  return prisma.securityIncident.findMany({
    where: { doctorId },
    orderBy: { detectedAt: "desc" }
  });
}

export async function updateIncidentStatus(
  doctorId: string,
  incidentId: string,
  status: IncidentStatus
) {
  const incident = await prisma.securityIncident.findUnique({ where: { id: incidentId } });

  if (!incident || incident.doctorId !== doctorId) {
    throw new ComplianceServiceError("Incidente no encontrado.", 404);
  }

  const updated = await prisma.securityIncident.update({
    where: { id: incidentId },
    data: {
      status,
      resolvedAt: status === IncidentStatus.RESOLVED ? new Date() : null
    }
  });

  await writeAuditLog({
    actorUserId: doctorId,
    entityType: "SecurityIncident",
    entityId: incidentId,
    action: "doctor.incident.status_changed",
    source: "compliance-service",
    metadata: { from: incident.status, to: status }
  });

  return updated;
}

export interface AuditExportInput {
  from?: Date;
  to?: Date;
}

/**
 * Exporta las entradas de auditoria del medico (como actor o como doctor del
 * registro) en un rango de fechas. Las entradas referencian IDs, nunca contenido
 * clinico (regla 4), por lo que la exportacion es segura.
 */
export async function exportAuditLog(doctorId: string, input: AuditExportInput = {}) {
  const createdAt: Prisma.DateTimeFilter = {};
  if (input.from) {
    createdAt.gte = input.from;
  }
  if (input.to) {
    createdAt.lte = input.to;
  }

  const where: Prisma.AuditLogWhereInput = {
    OR: [{ actorUserId: doctorId }, { doctorId }]
  };
  if (input.from || input.to) {
    where.createdAt = createdAt;
  }

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      source: true,
      ipAddress: true,
      metadata: true,
      createdAt: true
    }
  });

  await writeAuditLog({
    actorUserId: doctorId,
    entityType: "AuditLog",
    entityId: doctorId,
    action: "doctor.audit.exported",
    source: "compliance-service",
    metadata: { count: entries.length }
  });

  return {
    doctorId,
    generatedAt: new Date().toISOString(),
    from: input.from?.toISOString() ?? null,
    to: input.to?.toISOString() ?? null,
    count: entries.length,
    entries
  };
}

/** Resumen de politicas de retencion del portal y elementos purgables pendientes. */
export async function getRetentionSummary(now: Date = new Date()) {
  const [pendingMailboxDocuments, expiredHolds, expiredUploadLinks] = await prisma.$transaction([
    prisma.mailboxDocument.count({
      where: { status: { not: MailboxDocumentStatus.PURGED } }
    }),
    prisma.appointmentHold.count({
      where: { status: HoldStatus.ACTIVE, expiresAt: { lte: now } }
    }),
    prisma.documentUploadLink.count({
      where: { status: UploadLinkStatus.ACTIVE, expiresAt: { lte: now } }
    })
  ]);

  return {
    windows: RETENTION_WINDOWS,
    purgeable: {
      pendingMailboxDocuments,
      expiredHolds,
      expiredUploadLinks
    }
  };
}
