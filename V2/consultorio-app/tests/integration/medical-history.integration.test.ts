import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PatientStatus, PrismaClient } from "@prisma/client";
import _sodium from "libsodium-wrappers";

import { createDoctorAccount } from "../../src/services/auth/auth-service";
import { submitMedicalHistory } from "../../src/services/booking/public-booking-service";
import {
  ackSyncEvents,
  authenticateSyncDevice,
  getMailboxPrecheckinForDevice,
  getSyncInbox,
  linkSyncDevice
} from "../../src/services/sync/sync-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

function bearerRequest(token: string) {
  return new Request("http://localhost/api/sync/precheckins", {
    headers: { authorization: `Bearer ${token}` }
  });
}

/** Sella un payload con la llave publica del dispositivo, como el navegador. */
async function sealFor(publicKeyBase64: string, payload: unknown): Promise<string> {
  await _sodium.ready;
  const sodium = _sodium;
  const meta = new TextEncoder().encode(JSON.stringify({ kind: "medical-history" }));
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const envelope = new Uint8Array(4 + meta.length + body.length);
  new DataView(envelope.buffer).setUint32(0, meta.length, false);
  envelope.set(meta, 4);
  envelope.set(body, 4 + meta.length);
  const publicKey = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL);
  const sealed = sodium.crypto_box_seal(envelope, publicKey);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}

async function seedDoctorWithDeviceAndAppointment(label: string, withKey = true) {
  const email = uniqueEmail(label);
  const account = await createDoctorAccount({
    email,
    password: "Str0ngPass!123",
    firstName: "Silvia",
    lastName: "Marin",
    professionalName: "Dra. Silvia Marin",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });

  await _sodium.ready;
  const keypair = _sodium.crypto_box_keypair();
  const publicKey = _sodium.to_base64(keypair.publicKey, _sodium.base64_variants.ORIGINAL);
  const { deviceToken } = await linkSyncDevice(
    account.user.id,
    "PC consultorio",
    withKey ? publicKey : undefined
  );

  const patient = await prisma.patient.create({
    data: {
      ownerDoctorId: account.user.id,
      firstName: "Hugo",
      lastName: "Paz",
      phone: "6140001111",
      status: PatientStatus.ACTIVE
    }
  });

  const confirmationToken = randomUUID();
  const appointment = await prisma.appointment.create({
    data: {
      doctorId: account.user.id,
      patientId: patient.id,
      scheduledStart: new Date(Date.now() + 86400000),
      scheduledEnd: new Date(Date.now() + 86400000 + 1800000),
      confirmationToken
    }
  });

  return { email, doctorId: account.user.id, confirmationToken, appointment, deviceToken, keypair };
}

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }
  await prisma.precheckinSubmission.deleteMany({
    where: { appointment: { doctorId: user.id } }
  });
  await prisma.appointment.deleteMany({ where: { doctorId: user.id } });
  await prisma.patient.deleteMany({ where: { ownerDoctorId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("medical history sealed precheckin (paso 19, rebanada 7)", () => {
  it("stores only ciphertext, never plaintext, and delivers it E2E", async () => {
    const ctx = await seedDoctorWithDeviceAndAppointment("mh-doctor");
    const payload = { sex: "F", identification: { occupation: "Maestra" }, allergies: "penicilina" };

    try {
      await _sodium.ready;
      const publicKeyB64 = _sodium.to_base64(
        ctx.keypair.publicKey,
        _sodium.base64_variants.ORIGINAL
      );
      const ciphertext = await sealFor(publicKeyB64, payload);
      const { id } = await submitMedicalHistory({
        confirmationToken: ctx.confirmationToken,
        ciphertext
      });

      // La nube guarda SOLO el ciphertext: nada en claro.
      const stored = await prisma.precheckinSubmission.findUnique({ where: { id } });
      expect(stored?.kind).toBe("MEDICAL_HISTORY");
      expect(stored?.responses).toBeNull();
      expect(stored?.ciphertext).not.toBeNull();
      expect(stored?.sizeBytes).toBeGreaterThan(0);
      // El contenido clinico no aparece en claro en la fila.
      expect(JSON.stringify(stored)).not.toContain("penicilina");

      // El evento de sync no lleva respuestas, solo la referencia + sealed.
      const event = await prisma.syncEvent.findFirst({
        where: { doctorId: ctx.doctorId, type: "PRECHECKIN_SUBMITTED" }
      });
      const eventPayload = event?.payload as { precheckinId: string; sealed: boolean };
      expect(eventPayload.precheckinId).toBe(id);
      expect(eventPayload.sealed).toBe(true);
      expect(JSON.stringify(eventPayload)).not.toContain("responses");

      // El dispositivo descarga y descifra el sealed box (la nube no puede).
      const device = await authenticateSyncDevice(bearerRequest(ctx.deviceToken));
      const download = await getMailboxPrecheckinForDevice(device, id);
      await _sodium.ready;
      const opened = _sodium.crypto_box_seal_open(
        _sodium.from_base64(download.ciphertext, _sodium.base64_variants.ORIGINAL),
        ctx.keypair.publicKey,
        ctx.keypair.privateKey
      );
      const metaLen = new DataView(opened.buffer, opened.byteOffset).getUint32(0, false);
      const json = new TextDecoder().decode(opened.slice(4 + metaLen));
      expect(JSON.parse(json)).toEqual(payload);

      // ACK: la nube purga el ciphertext (frontera legal de residencia).
      const inbox = await getSyncInbox(device, 0);
      const ack = await ackSyncEvents(device, inbox.nextCursor);
      expect(ack.purgedClinicalEvents).toBeGreaterThanOrEqual(1);

      const purged = await prisma.precheckinSubmission.findUnique({ where: { id } });
      expect(purged?.ciphertext).toBeNull();
      expect(purged?.purgedAt).not.toBeNull();

      const purgedEvent = await prisma.syncEvent.findFirst({
        where: { doctorId: ctx.doctorId, type: "PRECHECKIN_SUBMITTED" }
      });
      expect(purgedEvent?.payload).toBeNull();

      // Tras la purga, re-descargar devuelve 410 (ya entregado).
      await expect(getMailboxPrecheckinForDevice(device, id)).rejects.toMatchObject({ status: 410 });
    } finally {
      await cleanupUserByEmail(ctx.email);
    }
  });

  it("refuses to store medical history when the doctor has no device key", async () => {
    const ctx = await seedDoctorWithDeviceAndAppointment("mh-nokey", false);

    try {
      await expect(
        submitMedicalHistory({
          confirmationToken: ctx.confirmationToken,
          ciphertext: randomBytes(120).toString("base64")
        })
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      await cleanupUserByEmail(ctx.email);
    }
  });
});
