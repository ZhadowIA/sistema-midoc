import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ClinicalProfile,
  NotificationKind,
  NotificationStatus,
  PatientStatus,
  PrismaClient
} from "@prisma/client";

import { createDoctorAccount, requestPasswordReset } from "../../src/services/auth/auth-service";
import {
  bookPublicAppointment,
  createAppointmentHold,
  listPublicAvailability
} from "../../src/services/booking/public-booking-service";
import {
  createAvailabilityRule,
  createDoctorService,
  updateDoctorProfile
} from "../../src/services/doctor/doctor-profile-service";
import { createUploadLink } from "../../src/services/documents/document-service";
import {
  processNotificationQueue,
  resolveShortLink
} from "../../src/services/notifications/notification-service";

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
  await prisma.notification.deleteMany({ where: { doctorId: user.id } });
  await prisma.shortLink.deleteMany({ where: { doctorId: user.id } });
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

describe("notification flow (paso 7)", () => {
  it("queues templated booking notifications, including SMS short links and a scheduled reminder", async () => {
    const email = uniqueEmail("doctor-notify");
    const slug = uniqueSlug("dra-notify");
    const patientEmail = uniqueEmail("patient-notify");
    const slotDate = nextWeekdayDate(2);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Luisa",
        lastName: "Nuñez",
        phone: "6140005000",
        professionalName: "Dra. Luisa Nuñez",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        professionalName: "Dra. Luisa Nuñez",
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
        slotInterval: 30
      });

      const availability = await listPublicAvailability({
        slug,
        serviceId: service.id,
        dateFrom,
        days: 1
      });

      const hold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });

      await bookPublicAppointment({
        holdToken: hold.token,
        patient: {
          firstName: "María",
          lastName: "Lopez",
          phone: "6141234567",
          email: patientEmail
        },
        reason: "Chequeo",
        legal: {
          acceptedTerms: true,
          acceptedPrivacy: true
        }
      });

      const notifications = await prisma.notification.findMany({
        where: { doctorId: account.user.id },
        orderBy: [{ kind: "asc" }, { channel: "asc" }]
      });

      expect(
        notifications.filter((item) => item.kind === NotificationKind.APPOINTMENT_CONFIRMATION)
      ).toHaveLength(2);
      expect(notifications.filter((item) => item.kind === NotificationKind.PRECHECKIN)).toHaveLength(2);
      expect(
        notifications.filter((item) => item.kind === NotificationKind.APPOINTMENT_REMINDER)
      ).toHaveLength(2);

      const smsConfirmation = notifications.find(
        (item) =>
          item.kind === NotificationKind.APPOINTMENT_CONFIRMATION && item.channel === "SMS"
      );
      expect(smsConfirmation?.shortLinkId).toBeTruthy();
      expect(smsConfirmation?.body).toContain("/s/");
      expect(smsConfirmation?.body).not.toContain("/perfil/");

      const reminder = notifications.find(
        (item) => item.kind === NotificationKind.APPOINTMENT_REMINDER && item.channel === "EMAIL"
      );
      expect(reminder?.scheduledFor).toBeInstanceOf(Date);
      expect(reminder?.status).toBe(NotificationStatus.PENDING);
      // Rebanada 9: el recordatorio lleva enlace de cancelacion (intencion en la URL).
      expect(reminder?.body).toContain("accion=cancelar");

      // El recordatorio por SMS usa enlace corto con expiracion (al inicio de la cita).
      const smsReminder = notifications.find(
        (item) => item.kind === NotificationKind.APPOINTMENT_REMINDER && item.channel === "SMS"
      );
      expect(smsReminder?.shortLinkId).toBeTruthy();
      expect(smsReminder?.body).toContain("/s/");
      if (smsReminder?.shortLinkId) {
        const shortLink = await prisma.shortLink.findUnique({ where: { id: smsReminder.shortLinkId } });
        expect(shortLink?.expiresAt).toBeInstanceOf(Date);
      }
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("queues document upload notifications for the patient when a doctor creates a temporary link", async () => {
    const email = uniqueEmail("doctor-upload-notify");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Dalia",
        lastName: "Mena",
        phone: "6140005001",
        professionalName: "Dra. Dalia Mena",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const patient = await prisma.patient.create({
        data: {
          ownerDoctorId: account.user.id,
          firstName: "Oscar",
          lastName: "Gil",
          phone: "6140008888",
          email: uniqueEmail("patient-upload"),
          status: PatientStatus.ACTIVE
        }
      });

      const result = await createUploadLink(account.user.id, { patientId: patient.id, maxUploads: 2 });

      const notifications = await prisma.notification.findMany({
        where: {
          doctorId: account.user.id,
          patientId: patient.id,
          kind: NotificationKind.DOCUMENT_UPLOAD
        },
        orderBy: { channel: "asc" }
      });

      expect(result.uploadUrl).toContain(`/carga/${result.link.token}`);
      expect(notifications).toHaveLength(2);
      expect(notifications[0]?.status).toBe(NotificationStatus.PENDING);
      expect(notifications.find((item) => item.channel === "SMS")?.shortLinkId).toBeTruthy();
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("processes the queue, retries transient failures, and expires single-use short links", async () => {
    const email = uniqueEmail("doctor-processing");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Nadia",
        lastName: "Rico",
        professionalName: "Dra. Nadia Rico",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const resetRequest = await requestPasswordReset({
        email,
        requestIp: "127.0.0.1",
        requestUserAgent: "vitest"
      });

      expect(resetRequest.resetToken).toBeTruthy();

      await prisma.notification.create({
        data: {
          doctorId: account.user.id,
          channel: "EMAIL",
          kind: NotificationKind.GENERAL,
          destination: "retry@example.com",
          subject: "Mensaje con retry",
          body: "Debe reintentarse una vez",
          status: NotificationStatus.PENDING,
          metadata: { mockFailTimes: 1 }
        }
      });

      const firstPass = await processNotificationQueue({ limit: 20, doctorId: account.user.id });
      expect(firstPass.processed).toBeGreaterThanOrEqual(2);
      expect(firstPass.sent).toBeGreaterThanOrEqual(1);
      expect(firstPass.retried).toBeGreaterThanOrEqual(1);

      const retryNotification = await prisma.notification.findFirstOrThrow({
        where: { doctorId: account.user.id, destination: "retry@example.com" }
      });
      expect(retryNotification.status).toBe(NotificationStatus.RETRIED);
      expect(retryNotification.lastError).toMatch(/mock/i);

      await prisma.notification.update({
        where: { id: retryNotification.id },
        data: { scheduledFor: new Date(Date.now() - 1000) }
      });

      const secondPass = await processNotificationQueue({ limit: 20, doctorId: account.user.id });
      expect(secondPass.sent).toBeGreaterThanOrEqual(1);

      const retriedThenSent = await prisma.notification.findUniqueOrThrow({
        where: { id: retryNotification.id }
      });
      expect(retriedThenSent.status).toBe(NotificationStatus.SENT);
      expect(retriedThenSent.retryCount).toBe(1);

      const smsNotification = await prisma.notification.findFirst({
        where: {
          doctorId: account.user.id,
          channel: "EMAIL",
          kind: NotificationKind.PASSWORD_RESET
        }
      });
      expect(smsNotification?.status).toBe(NotificationStatus.SENT);

      const shortLink = await prisma.shortLink.create({
        data: {
          doctorId: account.user.id,
          code: `t${randomUUID().replace(/-/g, "").slice(0, 7)}`,
          destinationUrl: "https://example.com/accion",
          maxUses: 1,
          expiresAt: new Date(Date.now() + 60_000)
        }
      });

      const resolved = await resolveShortLink(shortLink.code, { ipAddress: "127.0.0.1" });
      expect(resolved.destinationUrl).toBe("https://example.com/accion");

      await expect(resolveShortLink(shortLink.code, { ipAddress: "127.0.0.1" })).rejects.toMatchObject({
        status: 410
      });
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});
