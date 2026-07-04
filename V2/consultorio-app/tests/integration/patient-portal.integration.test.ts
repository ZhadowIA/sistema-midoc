import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuthorizedSummaryStatus, PatientStatus, PrismaClient } from "@prisma/client";

import { createDoctorAccount } from "../../src/services/auth/auth-service";
import { publishAuthorizedSummary } from "../../src/services/documents/authorized-summary-service";
import {
  getPatientPortalData,
  registerPatientAccount,
  signInPatient
} from "../../src/services/patient/patient-auth-service";
import { linkSyncDevice } from "../../src/services/sync/sync-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

const STRONG_PASSWORD = "P@cienteFuerte2026";

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }
  await prisma.authorizedSummary.deleteMany({ where: { doctorId: user.id } });
  await prisma.appointment.deleteMany({ where: { doctorId: user.id } });
  await prisma.patient.deleteMany({ where: { ownerDoctorId: user.id } });
  await prisma.authSession.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("patient portal account (paso 6, rebanada 5)", () => {
  it("registers, links existing Patient records by email, and lists appointments and summaries", async () => {
    const doctorEmail = uniqueEmail("portal-doctor");
    const patientEmail = uniqueEmail("portal-patient");

    try {
      const doctor = await createDoctorAccount({
        email: doctorEmail,
        password: "Str0ngPass!123",
        firstName: "Silvia",
        lastName: "Marin",
        professionalName: "Dra. Silvia Marin",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });
      const { device } = await linkSyncDevice(doctor.user.id, "PC", randomBytes(32).toString("base64"));

      // Patient creado al agendar (sin cuenta aun), con el mismo correo.
      const patient = await prisma.patient.create({
        data: {
          ownerDoctorId: doctor.user.id,
          firstName: "Hugo",
          lastName: "Paz",
          email: patientEmail,
          status: PatientStatus.ACTIVE
        }
      });
      await prisma.appointment.create({
        data: {
          doctorId: doctor.user.id,
          patientId: patient.id,
          status: "CONFIRMED",
          scheduledStart: new Date(Date.now() + 86_400_000),
          scheduledEnd: new Date(Date.now() + 88_200_000)
        }
      });
      await publishAuthorizedSummary(device, {
        patientId: patient.id,
        ciphertext: randomBytes(200),
        title: "Resumen de consulta"
      });

      // El paciente crea su cuenta: debe enlazarse al Patient existente.
      const account = await registerPatientAccount({
        email: patientEmail,
        password: STRONG_PASSWORD,
        firstName: "Hugo",
        lastName: "Paz",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const linked = await prisma.patient.findUnique({ where: { id: patient.id } });
      expect(linked?.userId).toBe(account.user.id);

      const portal = await getPatientPortalData(account.user.id);
      expect(portal.appointments).toHaveLength(1);
      expect(portal.appointments[0]!.doctorName).toBe("Dra. Silvia Marin");
      expect(portal.appointments[0]!.isUpcoming).toBe(true);
      expect(portal.summaries).toHaveLength(1);
      expect(portal.summaries[0]!.title).toBe("Resumen de consulta");
      expect(portal.summaries[0]!.status).toBe(AuthorizedSummaryStatus.ACTIVE);
    } finally {
      await cleanupUserByEmail(patientEmail);
      await cleanupUserByEmail(doctorEmail);
    }
  });

  it("signs in with valid credentials and rejects wrong ones", async () => {
    const email = uniqueEmail("portal-login");

    try {
      await registerPatientAccount({
        email,
        password: STRONG_PASSWORD,
        firstName: "Ana",
        lastName: "Ruiz",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const session = await signInPatient({ email, password: STRONG_PASSWORD });
      expect(session.sessionToken).toBeTruthy();

      await expect(signInPatient({ email, password: "incorrecta" })).rejects.toMatchObject({
        status: 401
      });
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("rejects duplicate registration and weak passwords", async () => {
    const email = uniqueEmail("portal-dup");

    try {
      await registerPatientAccount({
        email,
        password: STRONG_PASSWORD,
        firstName: "Ana",
        lastName: "Ruiz",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await expect(
        registerPatientAccount({
          email,
          password: STRONG_PASSWORD,
          firstName: "Ana",
          lastName: "Ruiz",
          termsVersion: "2026-05",
          privacyVersion: "2026-05"
        })
      ).rejects.toMatchObject({ status: 409 });

      await expect(
        registerPatientAccount({
          email: uniqueEmail("portal-weak"),
          password: "debil",
          firstName: "Ana",
          lastName: "Ruiz",
          termsVersion: "2026-05",
          privacyVersion: "2026-05"
        })
      ).rejects.toMatchObject({ status: 400 });
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("does not let a doctor account sign in through the patient endpoint", async () => {
    const email = uniqueEmail("portal-doctor-cross");

    try {
      await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Silvia",
        lastName: "Marin",
        professionalName: "Dra. Silvia Marin",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await expect(signInPatient({ email, password: "Str0ngPass!123" })).rejects.toMatchObject({
        status: 401
      });
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});
