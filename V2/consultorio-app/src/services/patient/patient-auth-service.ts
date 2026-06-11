import {
  AppointmentStatus,
  AuthorizedSummaryStatus,
  AuthSessionStatus,
  LegalDocumentType,
  UserRole,
  UserStatus
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { assertRateLimit } from "../../lib/rate-limit";
import { hashPassword, verifyPassword } from "../../lib/security/password";
import { generateOpaqueToken, hashOpaqueToken } from "../../lib/security/token";
import { ensureStrongPassword } from "../auth/auth-service";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

class PatientAuthError extends ServiceError {}

/**
 * Enlaza los registros Patient (creados al agendar) cuyo correo coincide con la
 * nueva cuenta. Un paciente puede tener un registro por cada medico con el que
 * agendo; todos quedan bajo su cuenta unica.
 */
async function linkPatientRecords(userId: string, email: string) {
  await prisma.patient.updateMany({
    where: { email, userId: null },
    data: { userId }
  });
}

export async function registerPatientAccount(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  termsVersion: string;
  privacyVersion: string;
  requestIp?: string;
}) {
  assertRateLimit({ key: `patient-register:${input.email.toLowerCase()}`, limit: 5, windowMs: 1000 * 60 * 15 });
  if (input.requestIp) {
    assertRateLimit({ key: `patient-register-ip:${input.requestIp}`, limit: 10, windowMs: 1000 * 60 * 15 });
  }

  ensureStrongPassword(input.password);

  const email = input.email.trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    throw new PatientAuthError("Ya existe una cuenta con este correo.", 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone?.trim(),
      legalAcceptances: {
        create: [
          { documentType: LegalDocumentType.TERMS, version: input.termsVersion },
          { documentType: LegalDocumentType.PRIVACY, version: input.privacyVersion }
        ]
      }
    }
  });

  await linkPatientRecords(user.id, email);

  await writeAuditLog({
    actorUserId: user.id,
    entityType: "User",
    entityId: user.id,
    action: "patient.registered",
    source: "patient-auth-service"
  });

  return { user };
}

export async function signInPatient(input: { email: string; password: string; requestIp?: string }) {
  assertRateLimit({ key: `patient-login:${input.email.toLowerCase()}`, limit: 10, windowMs: 1000 * 60 * 15 });
  if (input.requestIp) {
    assertRateLimit({ key: `patient-login-ip:${input.requestIp}`, limit: 30, windowMs: 1000 * 60 * 15 });
  }

  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.role !== UserRole.PATIENT || user.status !== UserStatus.ACTIVE || !user.passwordHash) {
    throw new PatientAuthError("Credenciales invalidas.", 401);
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new PatientAuthError("Credenciales invalidas.", 401);
  }

  // Re-enlaza por si agendo con un correo nuevo despues de crear la cuenta.
  await linkPatientRecords(user.id, email);

  const sessionToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: hashOpaqueToken(sessionToken),
      status: AuthSessionStatus.ACTIVE,
      expiresAt
    }
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await writeAuditLog({
    actorUserId: user.id,
    entityType: "AuthSession",
    entityId: hashOpaqueToken(sessionToken),
    action: "patient.login",
    source: "patient-auth-service"
  });

  return { user, sessionToken, expiresAt };
}

/**
 * Datos del portal del paciente: citas e historial autorizado a traves de todos
 * sus registros Patient enlazados. No expone contenido clinico: la nube no lo
 * tiene. Los resumenes se listan como metadatos (se abren con su enlace+llave).
 */
export async function getPatientPortalData(userId: string) {
  const patients = await prisma.patient.findMany({
    where: { userId },
    select: { id: true }
  });
  const patientIds = patients.map((patient) => patient.id);

  if (patientIds.length === 0) {
    return { appointments: [], summaries: [] };
  }

  const [appointments, summaries] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId: { in: patientIds } },
      orderBy: { scheduledStart: "desc" },
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        reason: true,
        service: { select: { name: true } },
        doctor: { select: { doctorProfile: { select: { professionalName: true } } } }
      }
    }),
    prisma.authorizedSummary.findMany({
      where: { patientId: { in: patientIds }, status: AuthorizedSummaryStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true, expiresAt: true, status: true }
    })
  ]);

  return {
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      status: appointment.status,
      scheduledStart: appointment.scheduledStart,
      scheduledEnd: appointment.scheduledEnd,
      reason: appointment.reason,
      serviceName: appointment.service?.name ?? null,
      doctorName: appointment.doctor.doctorProfile?.professionalName ?? null,
      isUpcoming:
        appointment.scheduledStart > new Date() &&
        appointment.status !== AppointmentStatus.CANCELLED
    })),
    summaries
  };
}
