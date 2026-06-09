import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClinicalProfile, HoldStatus, PrismaClient } from "@prisma/client";

import { createDoctorAccount, createDoctorSubscription } from "../../src/services/auth/auth-service";
import {
  bookPublicAppointment,
  cancelPublicAppointment,
  confirmPublicAppointment,
  createAppointmentHold,
  getPublicAppointmentByToken,
  listPublicAvailability,
  submitPrecheckin
} from "../../src/services/booking/public-booking-service";
import {
  createAvailabilityRule,
  createDoctorService,
  updateDoctorProfile
} from "../../src/services/doctor/doctor-profile-service";

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

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      doctorProfile: true
    }
  });

  if (!user) {
    return;
  }

  if (user.doctorProfile) {
    await prisma.doctorSubscription.deleteMany({
      where: {
        doctorProfileId: user.doctorProfile.id
      }
    });
  }

  await prisma.appointment.deleteMany({
    where: {
      doctorId: user.id
    }
  });

  await prisma.appointmentHold.deleteMany({
    where: {
      doctorId: user.id
    }
  });

  await prisma.patient.deleteMany({
    where: {
      ownerDoctorId: user.id
    }
  });

  await prisma.user.delete({
    where: {
      id: user.id
    }
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("public booking flow", () => {
  it("lists slots, creates a hold, books, confirms, and stores precheckin", async () => {
    const email = uniqueEmail("doctor-booking");
    const slug = uniqueSlug("dra-booking");
    const slotDate = nextWeekdayDate(2);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Lucia",
        lastName: "Campos",
        phone: "6140000300",
        professionalName: "Dra. Lucia Campos",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await createDoctorSubscription({
        doctorUserId: account.user.id,
        planCode: "ESSENTIAL"
      });

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        professionalName: "Dra. Lucia Campos",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        isPublic: true
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta general",
        priceCents: 90000,
        durationMinutes: 30
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: slotDate.getUTCDay(),
        startTime: "09:00",
        endTime: "11:00",
        slotInterval: 30,
        minAdvanceHours: 1,
        maxAdvanceDays: 30
      });

      const availability = await listPublicAvailability({
        slug,
        serviceId: service.id,
        dateFrom,
        days: 1
      });

      expect(availability.slots.length).toBeGreaterThan(0);

      const hold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });

      expect(hold.status).toBe(HoldStatus.ACTIVE);

      const appointment = await bookPublicAppointment({
        holdToken: hold.token,
        patient: {
          firstName: "Mario",
          lastName: "Lopez",
          phone: "6141234567",
          email: uniqueEmail("patient-booking")
        },
        reason: "Control anual",
        legal: {
          acceptedTerms: true,
          acceptedPrivacy: true,
          ipAddress: "127.0.0.1",
          userAgent: "vitest"
        }
      });

      expect(appointment.appointment.status).toBe("PENDING");

      await confirmPublicAppointment({
        confirmationToken: appointment.confirmationToken
      });

      await submitPrecheckin({
        confirmationToken: appointment.confirmationToken,
        responses: {
          chiefComplaint: "Dolor de cabeza",
          currentMedications: ["Paracetamol"]
        }
      });

      const details = await getPublicAppointmentByToken(appointment.confirmationToken);

      expect(details?.appointment.status).toBe("CONFIRMED");
      expect(details?.precheckin?.status).toBe("SUBMITTED");
      expect(details?.patient.firstName).toBe("Mario");
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("prevents double booking for the same slot and reuses the patient by doctor/email", async () => {
    const email = uniqueEmail("doctor-conflict");
    const slug = uniqueSlug("dra-conflict");
    const patientEmail = uniqueEmail("patient-conflict");
    const slotDate = nextWeekdayDate(3);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Nora",
        lastName: "Castro",
        phone: "6140000301",
        professionalName: "Dra. Nora Castro",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await createDoctorSubscription({
        doctorUserId: account.user.id,
        planCode: "ESSENTIAL"
      });

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        professionalName: "Dra. Nora Castro",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        isPublic: true
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta seguimiento",
        priceCents: 75000,
        durationMinutes: 30
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: slotDate.getUTCDay(),
        startTime: "10:00",
        endTime: "11:00",
        slotInterval: 30
      });

      const availability = await listPublicAvailability({
        slug,
        serviceId: service.id,
        dateFrom,
        days: 1
      });

      const holdA = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });

      const first = await bookPublicAppointment({
        holdToken: holdA.token,
        patient: {
          firstName: "Rebeca",
          lastName: "Luna",
          phone: "6149990000",
          email: patientEmail
        },
        legal: {
          acceptedTerms: true,
          acceptedPrivacy: true
        }
      });

      await expect(
        createAppointmentHold({
          slug,
          serviceId: service.id,
          slotStart: availability.slots[0]!.slotStart
        })
      ).rejects.toThrow(/available/i);

      const otherHold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[1]!.slotStart
      });

      const second = await bookPublicAppointment({
        holdToken: otherHold.token,
        patient: {
          firstName: "Rebeca",
          lastName: "Luna",
          phone: "6149990001",
          email: patientEmail
        },
        legal: {
          acceptedTerms: true,
          acceptedPrivacy: true
        }
      });

      expect(first.patient.id).toBe(second.patient.id);

      await cancelPublicAppointment({
        confirmationToken: second.confirmationToken,
        reason: "Cambio de planes"
      });

      const cancelled = await getPublicAppointmentByToken(second.confirmationToken);
      expect(cancelled?.appointment.status).toBe("CANCELLED");
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});
