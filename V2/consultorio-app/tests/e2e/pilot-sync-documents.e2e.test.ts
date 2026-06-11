import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClinicalProfile, PrismaClient } from "@prisma/client";

import { createDoctorAccount } from "../../src/services/auth/auth-service";
import {
  bookPublicAppointment,
  createAppointmentHold,
  listPublicAvailability,
  submitPrecheckin
} from "../../src/services/booking/public-booking-service";
import { createUploadLink } from "../../src/services/documents/document-service";
import {
  createAvailabilityRule,
  createDoctorService,
  updateDoctorProfile
} from "../../src/services/doctor/doctor-profile-service";
import { linkSyncDevice } from "../../src/services/sync/sync-service";

// Paso 9 - Step 2: desktop sync + mailbox documents over real HTTP.
// The shared `next dev` is started by tests/e2e/global-server.ts. This file
// seeds a doctor with a linked sync device, generates clinical sync events via
// a booking + precheckin, then exercises the device-facing sync API and the
// patient document upload -> device download round-trip over HTTP.

const PORT = Number(process.env.E2E_PORT ?? 3123);
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Wednesday; the seeded doctor is independent from the smoke suite's doctor.
const bookingWeekday = 3;

const prisma = new PrismaClient();
const ownerEmail = `e2e-sync-${randomUUID()}@example.com`;
const slug = `e2e-sync-${randomUUID().slice(0, 8)}`;

let serviceId = "";
let deviceToken = "";
let publicKey = "";
let uploadToken = "";

function nextWeekdayDateString(targetDay: number) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let diff = (targetDay - date.getUTCDay() + 7) % 7;
  if (diff === 0) {
    diff = 7;
  }
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

async function getJson(path: string, token?: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
  const parsed = await response.json().catch(() => null);
  return { status: response.status, body: parsed as Record<string, unknown> | null };
}

async function postJson(path: string, body: unknown, token?: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const parsed = await response.json().catch(() => null);
  return { status: response.status, body: parsed as Record<string, unknown> | null };
}

async function seed() {
  const account = await createDoctorAccount({
    email: ownerEmail,
    password: "Str0ngPass!123",
    firstName: "Silvia",
    lastName: "Marin",
    professionalName: "Dra. Silvia Marin (E2E)",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });

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
  serviceId = service.id;

  await createAvailabilityRule(account.user.id, {
    dayOfWeek: bookingWeekday,
    startTime: "09:00",
    endTime: "10:00",
    slotInterval: 30,
    minAdvanceHours: 1,
    maxAdvanceDays: 30
  });

  // Link the desktop device (publishes its document public key, returns the
  // opaque bearer token the desktop app would store).
  publicKey = randomBytes(32).toString("base64");
  const link = await linkSyncDevice(account.user.id, "PC consultorio E2E", publicKey);
  deviceToken = link.deviceToken;

  // Generate clinical sync events: a booking and its precheckin.
  const availability = await listPublicAvailability({
    slug,
    serviceId,
    dateFrom: nextWeekdayDateString(bookingWeekday),
    days: 1
  });
  const hold = await createAppointmentHold({
    slug,
    serviceId,
    slotStart: availability.slots[0]!.slotStart
  });
  const booking = await bookPublicAppointment({
    holdToken: hold.token,
    patient: { firstName: "Hugo", lastName: "Paz", phone: "6140001111" },
    legal: { acceptedTerms: true, acceptedPrivacy: true }
  });
  await submitPrecheckin({
    confirmationToken: booking.confirmationToken,
    responses: { motivo: "Dolor lumbar cronico" }
  });

  const uploadLink = await createUploadLink(account.user.id, {
    patientId: booking.patient.id,
    maxUploads: 2
  });
  uploadToken = uploadLink.link.token;
}

async function cleanup() {
  const user = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!user) {
    return;
  }

  // DocumentUploadLink (Restrict) cascades its MailboxDocuments; holds,
  // appointments and patients are Restrict so they precede the user. Deleting
  // the user cascades SyncDevice, SyncEvent, profile, services and rules.
  await prisma.notification.deleteMany({ where: { doctorId: user.id } });
  await prisma.shortLink.deleteMany({ where: { doctorId: user.id } });
  await prisma.documentUploadLink.deleteMany({ where: { doctorId: user.id } });
  await prisma.appointmentHold.deleteMany({ where: { doctorId: user.id } });
  await prisma.appointment.deleteMany({ where: { doctorId: user.id } });
  await prisma.patient.deleteMany({ where: { ownerDoctorId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

beforeAll(async () => {
  await prisma.$connect();
  await seed();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("desktop sync inbox over HTTP (paso 9, step 2)", () => {
  it("rejects an unknown device token", async () => {
    const response = await getJson("/api/sync/inbox", `bogus-${randomUUID()}`);
    expect(response.status).toBe(401);
  });

  it("delivers events, purges clinical content on ack, and drains the inbox", async () => {
    const inbox = await getJson("/api/sync/inbox", deviceToken);
    expect(inbox.status).toBe(200);

    const events = (inbox.body?.events ?? []) as Array<{ type: string }>;
    expect(events.map((event) => event.type)).toEqual([
      "APPOINTMENT_BOOKED",
      "PRECHECKIN_SUBMITTED"
    ]);
    const nextCursor = inbox.body?.nextCursor as number;
    expect(typeof nextCursor).toBe("number");

    const ack = await postJson("/api/sync/ack", { cursor: nextCursor }, deviceToken);
    expect(ack.status).toBe(200);
    expect(ack.body?.purgedClinicalEvents).toBe(1);

    const drained = await getJson(`/api/sync/inbox?cursor=${nextCursor}`, deviceToken);
    expect(drained.status).toBe(200);
    expect((drained.body?.events ?? []) as unknown[]).toHaveLength(0);
  });
});

describe("mailbox document round-trip over HTTP (paso 9, step 2)", () => {
  it("exposes the doctor key, accepts an encrypted upload, and the device downloads it", async () => {
    const info = await getJson(`/api/public/upload/${uploadToken}`);
    expect(info.status).toBe(200);
    expect(info.body?.documentPublicKey).toBe(publicKey);
    expect(info.body?.patientFirstName).toBe("Hugo");

    // The cloud never decrypts: it stores and forwards the sealed box verbatim.
    const ciphertextB64 = randomBytes(200).toString("base64");
    const upload = await postJson(`/api/public/upload/${uploadToken}`, {
      ciphertext: ciphertextB64
    });
    expect(upload.status).toBe(201);
    const documentId = upload.body?.id as string;
    expect(documentId).toBeTruthy();

    const download = await getJson(`/api/sync/documents/${documentId}`, deviceToken);
    expect(download.status).toBe(200);
    expect(download.body?.sizeBytes).toBe(200);
    expect(download.body?.ciphertext).toBe(ciphertextB64);
  });
});
