import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PatientStatus, PrismaClient } from "@prisma/client";

import { createDoctorAccount } from "../../src/services/auth/auth-service";
import {
  getAuthorizedSummaryForDownload,
  publishAuthorizedSummary,
  revokeAuthorizedSummary
} from "../../src/services/documents/authorized-summary-service";
import { linkSyncDevice } from "../../src/services/sync/sync-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

async function seedDoctorWithDevice(label: string) {
  const email = uniqueEmail(label);
  const account = await createDoctorAccount({
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
  const { device } = await linkSyncDevice(account.user.id, "PC consultorio", randomBytes(32).toString("base64"));
  const patient = await prisma.patient.create({
    data: { ownerDoctorId: account.user.id, firstName: "Hugo", lastName: "Paz", status: PatientStatus.ACTIVE }
  });
  return { email, doctorId: account.user.id, device, patient };
}

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }
  await prisma.authorizedSummary.deleteMany({ where: { doctorId: user.id } });
  await prisma.patient.deleteMany({ where: { ownerDoctorId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("authorized summary (paso 6, rebanada 4)", () => {
  it("publishes encrypted ciphertext and serves it to the patient, auditing access", async () => {
    const ctx = await seedDoctorWithDevice("summary-doc");

    try {
      const ciphertext = randomBytes(400);
      const published = await publishAuthorizedSummary(ctx.device, {
        patientId: ctx.patient.id,
        ciphertext,
        title: "Resumen de consulta"
      });
      expect(published.downloadUrl).toContain(`/resumen/${published.token}`);
      // El enlace NO incluye la llave: la agrega la app en el fragmento.
      expect(published.downloadUrl).not.toContain("#");

      const download = await getAuthorizedSummaryForDownload(published.token, { ipAddress: "1.2.3.4" });
      expect(Buffer.from(download.ciphertext, "base64").equals(ciphertext)).toBe(true);
      expect(download.title).toBe("Resumen de consulta");

      const stored = await prisma.authorizedSummary.findUnique({ where: { id: published.id } });
      expect(stored?.downloadCount).toBe(1);

      const accessLog = await prisma.auditLog.findFirst({
        where: { entityType: "AuthorizedSummary", entityId: published.id, action: "summary.downloaded" }
      });
      expect(accessLog).not.toBeNull();
    } finally {
      await cleanupUserByEmail(ctx.email);
    }
  });

  it("purges and rejects an expired summary", async () => {
    const ctx = await seedDoctorWithDevice("summary-expired");

    try {
      const published = await publishAuthorizedSummary(ctx.device, {
        patientId: ctx.patient.id,
        ciphertext: randomBytes(200)
      });
      await prisma.authorizedSummary.update({
        where: { id: published.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });

      await expect(getAuthorizedSummaryForDownload(published.token)).rejects.toMatchObject({ status: 410 });

      const purged = await prisma.authorizedSummary.findUnique({ where: { id: published.id } });
      expect(purged?.status).toBe("EXPIRED");
      expect(purged?.ciphertext).toBeNull();
    } finally {
      await cleanupUserByEmail(ctx.email);
    }
  });

  it("revokes a summary and purges its ciphertext", async () => {
    const ctx = await seedDoctorWithDevice("summary-revoke");

    try {
      const published = await publishAuthorizedSummary(ctx.device, {
        patientId: ctx.patient.id,
        ciphertext: randomBytes(200)
      });
      await revokeAuthorizedSummary(ctx.device, published.id);

      await expect(getAuthorizedSummaryForDownload(published.token)).rejects.toMatchObject({ status: 410 });
      const revoked = await prisma.authorizedSummary.findUnique({ where: { id: published.id } });
      expect(revoked?.status).toBe("REVOKED");
      expect(revoked?.ciphertext).toBeNull();
    } finally {
      await cleanupUserByEmail(ctx.email);
    }
  });

  it("refuses to publish for a patient that is not the doctor's", async () => {
    const owner = await seedDoctorWithDevice("summary-owner");
    const other = await seedDoctorWithDevice("summary-other");

    try {
      await expect(
        publishAuthorizedSummary(other.device, {
          patientId: owner.patient.id,
          ciphertext: randomBytes(200)
        })
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      await cleanupUserByEmail(owner.email);
      await cleanupUserByEmail(other.email);
    }
  });
});
