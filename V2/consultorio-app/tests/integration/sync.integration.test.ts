import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClinicalProfile, PrismaClient } from "@prisma/client";

import { createDoctorAccount } from "../../src/services/auth/auth-service";
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
  getSyncInbox,
  linkSyncDevice
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
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return;
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
