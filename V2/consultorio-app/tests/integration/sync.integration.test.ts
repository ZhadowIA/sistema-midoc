import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClinicalProfile, PrismaClient } from "@prisma/client";
import { approveDoctorAccountForTesting } from "../helpers/doctor-accounts";

import { createDoctorAccount, createDoctorSubscription } from "../../src/services/auth/auth-service";
import {
  bookPublicAppointment,
  createAppointmentHold,
  listPublicAvailability,
  submitPrecheckin
} from "../../src/services/booking/public-booking-service";
import {
  createAvailabilityRule,
  createDoctorService,
  updateDoctorProfile
} from "../../src/services/doctor/doctor-profile-service";
import {
  ackSyncEvents,
  authenticateSyncDevice,
  getActiveDeviceDocumentKey,
  getSyncDeviceProfile,
  getSyncInbox,
  linkSyncDevice,
  recordAiUsageBatch
} from "../../src/services/sync/sync-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

function uniqueSlug(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

function nextWeekdayDate(targetDay: number) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let diff = (targetDay - date.getUTCDay() + 7) % 7;

  if (diff === 0) {
    diff = 7;
  }

  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function bearerRequest(token: string) {
  return new Request("http://localhost/api/sync/inbox", {
    headers: { authorization: `Bearer ${token}` }
  });
}

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { doctorProfile: true }
  });

  if (!user) {
    return;
  }

  if (user.doctorProfile) {
    await prisma.doctorSubscription.deleteMany({
      where: { doctorProfileId: user.doctorProfile.id }
    });
  }

  await prisma.appointment.deleteMany({ where: { doctorId: user.id } });
  await prisma.appointmentHold.deleteMany({ where: { doctorId: user.id } });
  await prisma.patient.deleteMany({ where: { ownerDoctorId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("desktop sync (fase A)", () => {
  it("delivers booking events through the inbox and purges clinical content on ack", async () => {
    const email = uniqueEmail("doctor-sync");
    const slug = uniqueSlug("dra-sync");
    const slotDate = nextWeekdayDate(1);

    try {
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

      await approveDoctorAccountForTesting(prisma, account.user.id);

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        isPublic: true
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta",
        priceCents: 50000,
        durationMinutes: 30
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: slotDate.getUTCDay(),
        startTime: "09:00",
        endTime: "10:00",
        slotInterval: 30
      });

      // Vincular dispositivo (revoca el anterior si existiera).
      const firstLink = await linkSyncDevice(account.user.id, "PC consultorio");
      const secondLink = await linkSyncDevice(account.user.id, "PC consultorio 2");

      await expect(
        authenticateSyncDevice(bearerRequest(firstLink.deviceToken))
      ).rejects.toMatchObject({ status: 401 });

      const device = await authenticateSyncDevice(bearerRequest(secondLink.deviceToken));

      // Reservar cita + preconsulta para generar eventos.
      const availability = await listPublicAvailability({
        slug,
        serviceId: service.id,
        dateFrom: slotDate.toISOString().slice(0, 10),
        days: 1
      });
      const hold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });
      const booking = await bookPublicAppointment({
        holdToken: hold.token,
        patient: { firstName: "Hugo", lastName: "Paz", phone: "6140001111" },
        legal: { acceptedTerms: true, acceptedPrivacy: true }
      });
      const precheckin = await submitPrecheckin({
        confirmationToken: booking.confirmationToken,
        responses: { motivo: "Dolor lumbar cronico" }
      });

      // Inbox: entrega ordenada y repetible (mismo cursor, mismos eventos).
      const inbox = await getSyncInbox(device, 0);
      expect(inbox.events.map((event) => event.type)).toEqual([
        "APPOINTMENT_BOOKED",
        "PRECHECKIN_SUBMITTED"
      ]);

      const repeat = await getSyncInbox(device, 0);
      expect(repeat.events).toHaveLength(inbox.events.length);
      expect(repeat.nextCursor).toBe(inbox.nextCursor);

      const bookedPayload = inbox.events[0]!.payload as { patient: { firstName: string } };
      expect(bookedPayload.patient.firstName).toBe("Hugo");

      const clinicalPayload = inbox.events[1]!.payload as { responses: { motivo: string } };
      expect(clinicalPayload.responses.motivo).toBe("Dolor lumbar cronico");

      // ACK: purga el contenido clinico del evento y del buzon.
      const ack = await ackSyncEvents(device, inbox.nextCursor);
      expect(ack.purgedClinicalEvents).toBe(1);

      const purgedEvent = await prisma.syncEvent.findFirst({
        where: { doctorId: account.user.id, type: "PRECHECKIN_SUBMITTED" }
      });
      expect(purgedEvent?.purgedAt).not.toBeNull();
      expect(purgedEvent?.payload).toBeNull();

      const purgedPrecheckin = await prisma.precheckinSubmission.findUnique({
        where: { id: precheckin.id }
      });
      expect(purgedPrecheckin?.responses).toEqual({});

      // Re-ACK es idempotente y el inbox queda vacio tras el cursor.
      const reack = await ackSyncEvents(device, inbox.nextCursor);
      expect(reack.purgedClinicalEvents).toBe(0);

      const drained = await getSyncInbox(device, inbox.nextCursor);
      expect(drained.events).toHaveLength(0);
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});

describe("device profile metadata (paso 13, rebanada 4)", () => {
  it("exposes specialty, consultation duration and active working hours to the device", async () => {
    const email = uniqueEmail("doctor-profile-sync");
    const slug = uniqueSlug("dra-profile");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Eva",
        lastName: "Soto",
        professionalName: "Dra. Eva Soto",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await approveDoctorAccountForTesting(prisma, account.user.id);

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        specialty: ClinicalProfile.ODONTOLOGY,
        consultationDuration: 20,
        isPublic: true
      });

      // Dos franjas: la ventana laboral debe ir de la mas temprana a la mas tardia.
      await createAvailabilityRule(account.user.id, {
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "13:00",
        slotInterval: 20
      });
      await createAvailabilityRule(account.user.id, {
        dayOfWeek: 1,
        startTime: "16:00",
        endTime: "20:00",
        slotInterval: 20
      });

      const link = await linkSyncDevice(account.user.id, "PC perfil");
      const device = await authenticateSyncDevice(bearerRequest(link.deviceToken));

      const { profile } = await getSyncDeviceProfile(device);
      expect(profile?.specialty).toBe(ClinicalProfile.ODONTOLOGY);
      expect(profile?.consultationDuration).toBe(20);

      const starts = profile?.availabilityRules.map((rule) => rule.startTime).sort();
      const ends = profile?.availabilityRules.map((rule) => rule.endTime).sort();
      expect(starts).toEqual(["09:00", "16:00"]);
      expect(ends).toEqual(["13:00", "20:00"]);
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});

describe("device document public key (paso 6, fase B)", () => {
  it("stores a valid X25519 public key and exposes it for the active device", async () => {
    const email = uniqueEmail("doctor-key");
    const publicKey = randomBytes(32).toString("base64");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Nora",
        lastName: "Vela",
        professionalName: "Dra. Nora Vela",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      // Sin dispositivo vinculado aun no hay llave publicada.
      expect(await getActiveDeviceDocumentKey(account.user.id)).toBeNull();

      await linkSyncDevice(account.user.id, "PC consultorio", publicKey);
      expect(await getActiveDeviceDocumentKey(account.user.id)).toBe(publicKey);

      // Re-vincular con otra llave reemplaza la publicada (un dispositivo activo).
      const rotatedKey = randomBytes(32).toString("base64");
      await linkSyncDevice(account.user.id, "PC nueva", rotatedKey);
      expect(await getActiveDeviceDocumentKey(account.user.id)).toBe(rotatedKey);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("rejects a malformed or wrong-length public key", async () => {
    const email = uniqueEmail("doctor-badkey");

    try {
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

      // 16 bytes (longitud incorrecta) y base64 invalido deben rechazarse.
      await expect(
        linkSyncDevice(account.user.id, "PC", randomBytes(16).toString("base64"))
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        linkSyncDevice(account.user.id, "PC", "no-es-base64-valido!!!")
      ).rejects.toMatchObject({ status: 400 });
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});

describe("AI usage metadata sync (paso 11)", () => {
  it("records AI usage by reference only and is idempotent per device doctor", async () => {
    const email = uniqueEmail("doctor-ai-usage");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Ada",
        lastName: "Rivas",
        professionalName: "Dra. Ada Rivas",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });
      const { deviceToken } = await linkSyncDevice(account.user.id, "PC IA");
      const device = await authenticateSyncDevice(bearerRequest(deviceToken));

      const report = {
        externalRunId: randomUUID(),
        usageType: "SOAP_ASSIST",
        status: "APPROVED",
        providerName: "fake-clinico",
        providerType: "LLM",
        modelVersion: "fake-1",
        promptVersion: "soap-assist/v1",
        estimatedCostCents: 7,
        latencyMs: 12,
        occurredAt: "2026-06-11T12:00:00.000Z",
        inputReference: {
          kind: "LOCAL_AI_RUN_INPUT",
          localRunId: "local-run-1",
          patientId: "pat-local-1",
          encounterId: "enc-local-1"
        },
        outputReference: {
          kind: "LOCAL_AI_RUN_OUTPUT",
          localRunId: "local-run-1",
          patientId: "pat-local-1",
          encounterId: "enc-local-1"
        }
      };

      await expect(
        recordAiUsageBatch(device, {
          runs: [
            {
              ...report,
              inputReference: { ...report.inputReference, clinicalText: "Dolor lumbar" }
            }
          ]
        })
      ).rejects.toMatchObject({ status: 400 });

      const first = await recordAiUsageBatch(device, { runs: [report] });
      const second = await recordAiUsageBatch(device, { runs: [report] });

      expect(first.reported).toBe(1);
      expect(second.reported).toBe(1);

      const logs = await prisma.aiUsageLog.findMany({
        where: { doctorId: account.user.id, externalRunId: report.externalRunId }
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]?.usageType).toBe("SOAP_SUMMARY");
      expect(logs[0]?.status).toBe("REVIEWED");
      expect(logs[0]?.patientId).toBeNull();
      expect(logs[0]?.encounterId).toBeNull();
      expect(JSON.stringify(logs[0]?.inputReference)).not.toContain("Dolor lumbar");
      expect(JSON.stringify(logs[0]?.outputReference)).not.toContain("Dolor lumbar");
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("accepts a local transcription report with RFC3339 offset and omitted optionals", async () => {
    // Reproduce lo que envia la app de escritorio para un run local de
    // transcripcion: fecha con offset de zona (`+00:00` de chrono::to_rfc3339,
    // no solo `Z`) y opcionales omitidos (sin costo/latencia/version de modelo).
    // Antes esto fallaba con "Datos invalidos." (400).
    const email = uniqueEmail("doctor-ai-transcription");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Noa",
        lastName: "Vidal",
        professionalName: "Dra. Noa Vidal",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });
      const { deviceToken } = await linkSyncDevice(account.user.id, "PC transcripcion");
      const device = await authenticateSyncDevice(bearerRequest(deviceToken));

      const report = {
        externalRunId: randomUUID(),
        usageType: "TRANSCRIPTION",
        status: "APPROVED",
        providerName: "whisper-local",
        providerType: "TRANSCRIPTION",
        // Sin modelVersion / estimatedCostCents / latencyMs: claves omitidas.
        promptVersion: "transcription/v1",
        occurredAt: "2026-06-16T12:00:00.123456+00:00",
        inputReference: { kind: "LOCAL_AI_AUDIO_INPUT", localRunId: "local-run-tx" },
        outputReference: { kind: "LOCAL_AI_TRANSCRIPT_OUTPUT", localRunId: "local-run-tx" }
      };

      const result = await recordAiUsageBatch(device, { runs: [report] });
      expect(result.reported).toBe(1);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("charges plan credits for reported AI usage without double counting retries", async () => {
    const email = uniqueEmail("doctor-ai-credits");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Lina",
        lastName: "Campos",
        professionalName: "Dra. Lina Campos",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });
      await createDoctorSubscription({ doctorUserId: account.user.id, planCode: "CLINICO" });

      const { deviceToken } = await linkSyncDevice(account.user.id, "PC IA creditos");
      const device = await authenticateSyncDevice(bearerRequest(deviceToken));
      const occurredAt = "2026-06-17T12:00:00.000Z";
      const runs = [
        {
          externalRunId: randomUUID(),
          usageType: "SOAP_ASSIST",
          status: "APPROVED",
          providerName: "fake-clinico",
          providerType: "LLM",
          modelVersion: "fake-1",
          promptVersion: "soap-assist/v1",
          estimatedCostCents: 7,
          latencyMs: 12,
          occurredAt,
          inputReference: {
            kind: "LOCAL_AI_RUN_INPUT",
            localRunId: "local-run-credits-1"
          },
          outputReference: {
            kind: "LOCAL_AI_RUN_OUTPUT",
            localRunId: "local-run-credits-1"
          }
        },
        {
          externalRunId: randomUUID(),
          usageType: "LONGITUDINAL_SUMMARY",
          status: "APPROVED",
          providerName: "fake-clinico",
          providerType: "LLM",
          modelVersion: "fake-1",
          promptVersion: "summary/v1",
          estimatedCostCents: 11,
          latencyMs: 18,
          occurredAt,
          inputReference: {
            kind: "LOCAL_AI_RUN_INPUT",
            localRunId: "local-run-credits-2"
          },
          outputReference: {
            kind: "LOCAL_AI_RUN_OUTPUT",
            localRunId: "local-run-credits-2"
          }
        }
      ];

      const first = await recordAiUsageBatch(device, { runs });
      expect(first.reported).toBe(2);
      expect(first.creditSummary.monthlyCredits).toBe(120);
      expect(first.creditSummary.consumedCredits).toBe(3);
      expect(first.creditSummary.remainingCredits).toBe(117);

      const retry = await recordAiUsageBatch(device, { runs });
      expect(retry.creditSummary.consumedCredits).toBe(3);

      const logs = await prisma.aiUsageLog.findMany({
        where: { doctorId: account.user.id },
        orderBy: { creditCost: "asc" },
        select: { externalRunId: true, creditCost: true }
      });
      expect(logs.map((log) => log.creditCost)).toEqual([1, 2]);
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});
