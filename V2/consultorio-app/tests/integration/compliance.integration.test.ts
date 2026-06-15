import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { IncidentSeverity, IncidentStatus, PrismaClient } from "@prisma/client";

import { createDoctorAccount } from "../../src/services/auth/auth-service";
import {
  exportAuditLog,
  getRetentionSummary,
  listIncidents,
  reportIncident,
  updateIncidentStatus
} from "../../src/services/compliance/compliance-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

async function registerDoctor(label: string) {
  const email = uniqueEmail(label);
  const account = await createDoctorAccount({
    email,
    password: "Str0ngPass!123",
    firstName: "Lucia",
    lastName: "Pena",
    professionalName: "Dra. Lucia Pena",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });
  return { email, userId: account.user.id };
}

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }
  await prisma.securityIncident.deleteMany({ where: { doctorId: user.id } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: user.id }, { doctorId: user.id }] } });
  await prisma.user.delete({ where: { id: user.id } });
}

const createdEmails: string[] = [];

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  for (const email of createdEmails) {
    await cleanupUserByEmail(email);
  }
  await prisma.$disconnect();
});

describe("compliance: incidents, audit export, retention (paso 12, rebanada 3)", () => {
  it("reports an incident, lists it, and resolves it with a timestamp", async () => {
    const { email, userId } = await registerDoctor("incident");
    createdEmails.push(email);

    const incident = await reportIncident(userId, {
      category: "ACCESO_INDEBIDO",
      title: "Intento de acceso fallido repetido",
      description: "Se detectaron 12 intentos de login fallidos para la cuenta ref U-123.",
      severity: IncidentSeverity.HIGH
    });
    expect(incident.status).toBe(IncidentStatus.OPEN);

    const listed = await listIncidents(userId);
    expect(listed).toHaveLength(1);

    const resolved = await updateIncidentStatus(userId, incident.id, IncidentStatus.RESOLVED);
    expect(resolved.status).toBe(IncidentStatus.RESOLVED);
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("isolates incidents per doctor", async () => {
    const a = await registerDoctor("incident-a");
    const b = await registerDoctor("incident-b");
    createdEmails.push(a.email, b.email);

    const incident = await reportIncident(a.userId, {
      category: "FUGA",
      title: "Revision de enlace expirado",
      description: "Enlace de carga ref L-9 accedido tras expiracion."
    });

    // El doctor B no puede tocar el incidente del doctor A.
    await expect(
      updateIncidentStatus(b.userId, incident.id, IncidentStatus.RESOLVED)
    ).rejects.toMatchObject({ status: 404 });

    expect(await listIncidents(b.userId)).toHaveLength(0);
  });

  it("exports only the doctor's own audit entries within a range", async () => {
    const { email, userId } = await registerDoctor("audit-export");
    createdEmails.push(email);

    // El registro de la cuenta ya genero entradas de auditoria para este doctor.
    const result = await exportAuditLog(userId, {});
    expect(result.doctorId).toBe(userId);
    expect(result.count).toBeGreaterThan(0);
    // Sin contenido clinico: solo acciones, tipos de entidad e IDs.
    for (const entry of result.entries) {
      expect(typeof entry.action).toBe("string");
      expect(entry).not.toHaveProperty("clinicalContent");
    }

    // Rango futuro: nada.
    const empty = await exportAuditLog(userId, { from: new Date(Date.now() + 3_600_000) });
    expect(empty.count).toBe(0);
  });

  it("summarizes retention windows and purgeable counts", async () => {
    const { email } = await registerDoctor("retention");
    createdEmails.push(email);

    const summary = await getRetentionSummary();
    expect(summary.windows.mailboxDocumentsDays).toBe(30);
    expect(summary.purgeable).toHaveProperty("pendingMailboxDocuments");
    expect(typeof summary.purgeable.expiredHolds).toBe("number");
  });
});
