import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PatientStatus, PrismaClient, UploadLinkStatus } from "@prisma/client";

import { createDoctorAccount } from "../../src/services/auth/auth-service";
import {
  createUploadLink,
  getUploadLinkForUpload,
  revokeUploadLink,
  submitMailboxDocument
} from "../../src/services/documents/document-service";
import {
  ackSyncEvents,
  authenticateSyncDevice,
  getMailboxDocumentForDevice,
  getSyncInbox,
  linkSyncDevice
} from "../../src/services/sync/sync-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

function bearerRequest(token: string) {
  return new Request("http://localhost/api/sync/documents", {
    headers: { authorization: `Bearer ${token}` }
  });
}

async function createPatientFor(doctorId: string) {
  return prisma.patient.create({
    data: {
      ownerDoctorId: doctorId,
      firstName: "Hugo",
      lastName: "Paz",
      phone: "6140001111",
      status: PatientStatus.ACTIVE
    }
  });
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
  const publicKey = randomBytes(32).toString("base64");
  const { deviceToken } = await linkSyncDevice(account.user.id, "PC consultorio", publicKey);
  const patient = await createPatientFor(account.user.id);
  return { email, doctorId: account.user.id, patient, publicKey, deviceToken };
}

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }
  await prisma.mailboxDocument.deleteMany({ where: { doctorId: user.id } });
  await prisma.documentUploadLink.deleteMany({ where: { doctorId: user.id } });
  await prisma.patient.deleteMany({ where: { ownerDoctorId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("document upload links + mailbox (paso 6, fase B)", () => {
  it("creates a link, exposes the doctor public key, and accepts an encrypted upload", async () => {
    const ctx = await seedDoctorWithDevice("doctor-doc");

    try {
      const { link, uploadUrl } = await createUploadLink(ctx.doctorId, {
        patientId: ctx.patient.id,
        maxUploads: 2
      });
      expect(uploadUrl).toContain(`/carga/${link.token}`);

      const info = await getUploadLinkForUpload(link.token);
      expect(info.documentPublicKey).toBe(ctx.publicKey);
      expect(info.patientFirstName).toBe("Hugo");

      const ciphertext = randomBytes(200);
      const result = await submitMailboxDocument(link.token, { ciphertext });

      const stored = await prisma.mailboxDocument.findUnique({ where: { id: result.id } });
      expect(stored?.sizeBytes).toBe(200);
      expect(stored?.ciphertext).not.toBeNull();
      expect(stored?.status).toBe("PENDING");

      // El evento de sync no lleva contenido clinico, solo referencias.
      const event = await prisma.syncEvent.findFirst({
        where: { doctorId: ctx.doctorId, type: "DOCUMENT_UPLOADED" }
      });
      const payload = event?.payload as { mailboxDocumentId: string; sizeBytes: number };
      expect(payload.mailboxDocumentId).toBe(result.id);
      expect(payload.sizeBytes).toBe(200);
      expect(JSON.stringify(payload)).not.toContain("ciphertext");

      const afterOne = await prisma.documentUploadLink.findUnique({ where: { id: link.id } });
      expect(afterOne?.uploadCount).toBe(1);
      expect(afterOne?.status).toBe(UploadLinkStatus.ACTIVE);
    } finally {
      await cleanupUserByEmail(ctx.email);
    }
  });

  it("marks the link USED at maxUploads and rejects further uploads", async () => {
    const ctx = await seedDoctorWithDevice("doctor-limit");

    try {
      const { link } = await createUploadLink(ctx.doctorId, {
        patientId: ctx.patient.id,
        maxUploads: 1
      });

      await submitMailboxDocument(link.token, { ciphertext: randomBytes(100) });

      const used = await prisma.documentUploadLink.findUnique({ where: { id: link.id } });
      expect(used?.status).toBe(UploadLinkStatus.USED);

      await expect(
        submitMailboxDocument(link.token, { ciphertext: randomBytes(100) })
      ).rejects.toMatchObject({ status: 410 });
    } finally {
      await cleanupUserByEmail(ctx.email);
    }
  });

  it("rejects revoked and expired links", async () => {
    const ctx = await seedDoctorWithDevice("doctor-revoke");

    try {
      const revoked = await createUploadLink(ctx.doctorId, { patientId: ctx.patient.id });
      await revokeUploadLink(ctx.doctorId, revoked.link.id);
      await expect(getUploadLinkForUpload(revoked.link.token)).rejects.toMatchObject({ status: 410 });
      await expect(
        submitMailboxDocument(revoked.link.token, { ciphertext: randomBytes(100) })
      ).rejects.toMatchObject({ status: 410 });

      const expired = await createUploadLink(ctx.doctorId, { patientId: ctx.patient.id });
      await prisma.documentUploadLink.update({
        where: { id: expired.link.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });
      await expect(getUploadLinkForUpload(expired.link.token)).rejects.toMatchObject({ status: 410 });
    } finally {
      await cleanupUserByEmail(ctx.email);
    }
  });

  it("refuses to resolve a link when the doctor has no document key yet", async () => {
    const email = uniqueEmail("doctor-nokey");
    const account = await createDoctorAccount({
      email,
      password: "Str0ngPass!123",
      firstName: "Iris",
      lastName: "Lara",
      professionalName: "Dra. Iris Lara",
      licenseNumber: "1234567",
      specialty: "GENERAL_MEDICINE",
      termsVersion: "2026-05",
      privacyVersion: "2026-05"
    });

    try {
      const patient = await createPatientFor(account.user.id);
      // Dispositivo vinculado sin llave publica (caso degenerado / app vieja).
      await linkSyncDevice(account.user.id, "PC sin llave");
      const { link } = await createUploadLink(account.user.id, { patientId: patient.id });

      await expect(getUploadLinkForUpload(link.token)).rejects.toMatchObject({ status: 409 });
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("delivers the ciphertext to the device and purges it on ack (fase B)", async () => {
    const ctx = await seedDoctorWithDevice("doctor-syncdoc");

    try {
      const { link } = await createUploadLink(ctx.doctorId, { patientId: ctx.patient.id });
      const ciphertext = randomBytes(300);
      const { id: documentId } = await submitMailboxDocument(link.token, { ciphertext });

      const device = await authenticateSyncDevice(bearerRequest(ctx.deviceToken));

      // El dispositivo descarga el ciphertext (la nube no puede leerlo).
      const download = await getMailboxDocumentForDevice(device, documentId);
      expect(Buffer.from(download.ciphertext, "base64").equals(ciphertext)).toBe(true);

      // ACK hasta el evento del documento: purga el ciphertext en la nube.
      const inbox = await getSyncInbox(device, 0);
      const ack = await ackSyncEvents(device, inbox.nextCursor);
      expect(ack.purgedClinicalEvents).toBeGreaterThanOrEqual(1);

      const purged = await prisma.mailboxDocument.findUnique({ where: { id: documentId } });
      expect(purged?.status).toBe("PURGED");
      expect(purged?.ciphertext).toBeNull();
      expect(purged?.purgedAt).not.toBeNull();

      const purgedEvent = await prisma.syncEvent.findFirst({
        where: { doctorId: ctx.doctorId, type: "DOCUMENT_UPLOADED" }
      });
      expect(purgedEvent?.payload).toBeNull();

      // Tras la purga, re-descargar devuelve 410 (ya entregado).
      await expect(getMailboxDocumentForDevice(device, documentId)).rejects.toMatchObject({
        status: 410
      });
    } finally {
      await cleanupUserByEmail(ctx.email);
    }
  });

  it("does not let another doctor's device download the ciphertext", async () => {
    const owner = await seedDoctorWithDevice("doctor-owner");
    const intruder = await seedDoctorWithDevice("doctor-intruder");

    try {
      const { link } = await createUploadLink(owner.doctorId, { patientId: owner.patient.id });
      const { id: documentId } = await submitMailboxDocument(link.token, {
        ciphertext: randomBytes(120)
      });

      const intruderDevice = await authenticateSyncDevice(bearerRequest(intruder.deviceToken));
      await expect(getMailboxDocumentForDevice(intruderDevice, documentId)).rejects.toMatchObject({
        status: 404
      });
    } finally {
      await cleanupUserByEmail(owner.email);
      await cleanupUserByEmail(intruder.email);
    }
  });

  it("rejects ciphertext that is too small to be a sealed box", async () => {
    const ctx = await seedDoctorWithDevice("doctor-tiny");

    try {
      const { link } = await createUploadLink(ctx.doctorId, { patientId: ctx.patient.id });
      await expect(
        submitMailboxDocument(link.token, { ciphertext: randomBytes(10) })
      ).rejects.toMatchObject({ status: 400 });
    } finally {
      await cleanupUserByEmail(ctx.email);
    }
  });
});
