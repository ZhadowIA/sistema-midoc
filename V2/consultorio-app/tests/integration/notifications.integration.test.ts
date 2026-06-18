import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ClinicalProfile,
  ConsentType,
  NotificationKind,
  NotificationStatus,
  PatientStatus,
  PrismaClient
} from "@prisma/client";

import { approveDoctorAccountForTesting } from "../helpers/doctor-accounts";

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
import { env } from "../../src/lib/env";
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

  if (diff < 2) {
    diff += 7;
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
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await approveDoctorAccountForTesting(prisma, account.user.id);

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
        licenseNumber: "1234567",
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

  it("queues phone notifications as WhatsApp when the phone channel is configured for WhatsApp", async () => {
    const email = uniqueEmail("doctor-upload-whatsapp");
    const originalPhoneNotificationChannel = env.PHONE_NOTIFICATION_CHANNEL;

    try {
      env.PHONE_NOTIFICATION_CHANNEL = "WHATSAPP";
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Rosa",
        lastName: "Luna",
        phone: "6140005002",
        professionalName: "Dra. Rosa Luna",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const patient = await prisma.patient.create({
        data: {
          ownerDoctorId: account.user.id,
          firstName: "Elena",
          lastName: "Paz",
          phone: "+526140008888",
          email: uniqueEmail("patient-whatsapp-upload"),
          preferredPhoneChannel: "WHATSAPP",
          status: PatientStatus.ACTIVE
        }
      });
      await prisma.consent.create({
        data: {
          patientId: patient.id,
          doctorId: account.user.id,
          type: ConsentType.WHATSAPP_NOTIFICATIONS,
          version: "2026-05",
          granted: true,
          evidence: { source: "vitest" }
        }
      });

      await createUploadLink(account.user.id, { patientId: patient.id, maxUploads: 2 });

      const phoneNotification = await prisma.notification.findFirstOrThrow({
        where: {
          doctorId: account.user.id,
          patientId: patient.id,
          kind: NotificationKind.DOCUMENT_UPLOAD,
          destination: patient.phone ?? undefined
        }
      });

      expect(phoneNotification.channel).toBe("WHATSAPP");
      expect(phoneNotification.shortLinkId).toBeTruthy();
      expect(phoneNotification.body).toContain("/s/");
    } finally {
      env.PHONE_NOTIFICATION_CHANNEL = originalPhoneNotificationChannel;
      await cleanupUserByEmail(email);
    }
  });

  it("records patient messaging consent and honors WhatsApp as the preferred phone channel", async () => {
    const email = uniqueEmail("doctor-booking-whatsapp-consent");
    const slug = uniqueSlug("dra-whatsapp-consent");
    const patientEmail = uniqueEmail("patient-whatsapp-consent");
    const slotDate = nextWeekdayDate(2);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Laura",
        lastName: "Mora",
        phone: "6140005003",
        professionalName: "Dra. Laura Mora",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await approveDoctorAccountForTesting(prisma, account.user.id);

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        professionalName: "Dra. Laura Mora",
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

      const availability = await listPublicAvailability({ slug, serviceId: service.id, dateFrom, days: 1 });
      const hold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });

      const booking = await bookPublicAppointment({
        holdToken: hold.token,
        patient: {
          firstName: "Claudia",
          lastName: "Rivas",
          phone: "+526141234567",
          email: patientEmail
        },
        legal: {
          acceptedTerms: true,
          acceptedPrivacy: true,
          ipAddress: "127.0.0.1",
          userAgent: "vitest",
          notificationConsent: {
            sms: true,
            whatsapp: true,
            preferredPhoneChannel: "WHATSAPP"
          }
        }
      });

      const patient = await prisma.patient.findUniqueOrThrow({ where: { id: booking.patient.id } });
      expect(patient.preferredPhoneChannel).toBe("WHATSAPP");

      const consents = await prisma.consent.findMany({
        where: { patientId: booking.patient.id },
        orderBy: { type: "asc" }
      });
      expect(consents.map((consent) => ({ type: consent.type, granted: consent.granted }))).toEqual([
        { type: "SMS_NOTIFICATIONS", granted: true },
        { type: "WHATSAPP_NOTIFICATIONS", granted: true }
      ]);
      expect(consents.every((consent) => consent.doctorId === account.user.id)).toBe(true);
      expect(consents.every((consent) => consent.version === "2026-05")).toBe(true);

      const phoneConfirmation = await prisma.notification.findFirstOrThrow({
        where: {
          appointmentId: booking.appointment.id,
          kind: NotificationKind.APPOINTMENT_CONFIRMATION,
          destination: "+526141234567"
        }
      });
      expect(phoneConfirmation.channel).toBe("WHATSAPP");
      expect(phoneConfirmation.shortLinkId).toBeTruthy();
      expect(phoneConfirmation.body).toContain("/s/");

      const smsNotification = await prisma.notification.findFirst({
        where: { appointmentId: booking.appointment.id, channel: "SMS" }
      });
      expect(smsNotification).toBeNull();
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("does not use WhatsApp from global phone-channel config without patient WhatsApp consent", async () => {
    const email = uniqueEmail("doctor-upload-no-whatsapp-consent");
    const originalPhoneNotificationChannel = env.PHONE_NOTIFICATION_CHANNEL;

    try {
      env.PHONE_NOTIFICATION_CHANNEL = "WHATSAPP";
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Lina",
        lastName: "Soto",
        phone: "6140005004",
        professionalName: "Dra. Lina Soto",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const patient = await prisma.patient.create({
        data: {
          ownerDoctorId: account.user.id,
          firstName: "Pablo",
          lastName: "Cano",
          phone: "+526140008888",
          email: uniqueEmail("patient-no-whatsapp-consent"),
          status: PatientStatus.ACTIVE
        }
      });

      await createUploadLink(account.user.id, { patientId: patient.id, maxUploads: 2 });

      const phoneNotification = await prisma.notification.findFirstOrThrow({
        where: {
          doctorId: account.user.id,
          patientId: patient.id,
          kind: NotificationKind.DOCUMENT_UPLOAD,
          destination: patient.phone ?? undefined
        }
      });

      expect(phoneNotification.channel).toBe("SMS");
    } finally {
      env.PHONE_NOTIFICATION_CHANNEL = originalPhoneNotificationChannel;
      await cleanupUserByEmail(email);
    }
  });

  it("does not queue phone notifications when the patient declines phone reminders", async () => {
    const email = uniqueEmail("doctor-phone-opt-out");
    const slug = uniqueSlug("dra-phone-opt-out");
    const patientEmail = uniqueEmail("patient-phone-opt-out");
    const slotDate = nextWeekdayDate(2);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Miriam",
        lastName: "Vidal",
        phone: "6140005005",
        professionalName: "Dra. Miriam Vidal",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await approveDoctorAccountForTesting(prisma, account.user.id);

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        professionalName: "Dra. Miriam Vidal",
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

      const availability = await listPublicAvailability({ slug, serviceId: service.id, dateFrom, days: 1 });
      const hold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });

      const booking = await bookPublicAppointment({
        holdToken: hold.token,
        patient: {
          firstName: "Daniela",
          lastName: "Nava",
          phone: "+526141234567",
          email: patientEmail
        },
        legal: {
          acceptedTerms: true,
          acceptedPrivacy: true,
          notificationConsent: {
            sms: false,
            whatsapp: false
          }
        }
      });

      const phoneNotification = await prisma.notification.findFirst({
        where: {
          appointmentId: booking.appointment.id,
          destination: "+526141234567"
        }
      });
      const emailConfirmation = await prisma.notification.findFirst({
        where: {
          appointmentId: booking.appointment.id,
          channel: "EMAIL",
          kind: NotificationKind.APPOINTMENT_CONFIRMATION
        }
      });

      expect(phoneNotification).toBeNull();
      expect(emailConfirmation).not.toBeNull();
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
        licenseNumber: "1234567",
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

  it("delivers pending SMS through Twilio when the SMS provider is enabled", async () => {
    const email = uniqueEmail("doctor-twilio");
    const originalSmsProvider = env.SMS_PROVIDER;
    const originalSmsBaseUrl = env.SMS_BASE_URL;
    const originalTwilioAccountSid = env.TWILIO_ACCOUNT_SID;
    const originalTwilioAuthToken = env.TWILIO_AUTH_TOKEN;
    const originalTwilioMessagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;
    const originalTwilioFromPhoneNumber = env.TWILIO_FROM_PHONE_NUMBER;
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ sid: "SMintegration123", status: "queued" }), { status: 201 });
    });
    const originalFetch = globalThis.fetch;

    try {
      env.SMS_PROVIDER = "twilio";
      env.SMS_BASE_URL = "https://api.twilio.com";
      env.TWILIO_ACCOUNT_SID = "ACintegration";
      env.TWILIO_AUTH_TOKEN = "integration-token";
      env.TWILIO_MESSAGING_SERVICE_SID = "MGintegration";
      env.TWILIO_FROM_PHONE_NUMBER = undefined;
      globalThis.fetch = fetchMock as typeof fetch;

      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Teresa",
        lastName: "Vega",
        professionalName: "Dra. Teresa Vega",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      // El registro encola una notificación de verificación de correo; la quitamos
      // para que la cola procese únicamente la notificación bajo prueba.
      await prisma.notification.deleteMany({ where: { doctorId: account.user.id } });

      await prisma.notification.create({
        data: {
          doctorId: account.user.id,
          channel: "SMS",
          kind: NotificationKind.APPOINTMENT_REMINDER,
          destination: "+526141234567",
          body: "Recordatorio: tienes una cita. Ver detalles: https://midoc.example/s/abc",
          status: NotificationStatus.PENDING
        }
      });

      const stats = await processNotificationQueue({ doctorId: account.user.id });
      const delivered = await prisma.notification.findFirstOrThrow({
        where: { doctorId: account.user.id, channel: "SMS" }
      });

      expect(stats.sent).toBe(1);
      expect(delivered.status).toBe(NotificationStatus.SENT);
      expect(delivered.provider).toBe("TWILIO");
      expect(delivered.providerMessageId).toBe("SMintegration123");
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      env.SMS_PROVIDER = originalSmsProvider;
      env.SMS_BASE_URL = originalSmsBaseUrl;
      env.TWILIO_ACCOUNT_SID = originalTwilioAccountSid;
      env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
      env.TWILIO_MESSAGING_SERVICE_SID = originalTwilioMessagingServiceSid;
      env.TWILIO_FROM_PHONE_NUMBER = originalTwilioFromPhoneNumber;
      globalThis.fetch = originalFetch;
      await cleanupUserByEmail(email);
    }
  });

  it("delivers pending email through Resend when the email provider is enabled", async () => {
    const email = uniqueEmail("doctor-resend");
    const originalEmailProvider = env.EMAIL_PROVIDER;
    const originalEmailBaseUrl = env.EMAIL_BASE_URL;
    const originalEmailApiKey = env.EMAIL_API_KEY;
    const originalEmailFrom = env.EMAIL_FROM;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ id: "email_integration_123" }), { status: 200 });
    });
    const originalFetch = globalThis.fetch;

    try {
      env.EMAIL_PROVIDER = "resend";
      env.EMAIL_BASE_URL = "https://api.resend.com";
      env.EMAIL_API_KEY = "re_integration";
      env.EMAIL_FROM = "MiDoc <notificaciones@midoc.test>";
      globalThis.fetch = fetchMock as typeof fetch;

      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Renata",
        lastName: "Diaz",
        professionalName: "Dra. Renata Diaz",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      // El registro encola una notificación de verificación de correo; la quitamos
      // para que la cola procese únicamente la notificación bajo prueba.
      await prisma.notification.deleteMany({ where: { doctorId: account.user.id } });

      await prisma.notification.create({
        data: {
          doctorId: account.user.id,
          channel: "EMAIL",
          kind: NotificationKind.PASSWORD_RESET,
          destination: "paciente@example.com",
          subject: "Codigo para recuperar tu cuenta MiDoc",
          body: "Tu codigo MiDoc para restablecer la contrasena es: 123456",
          status: NotificationStatus.PENDING
        }
      });

      const stats = await processNotificationQueue({ doctorId: account.user.id });
      const delivered = await prisma.notification.findFirstOrThrow({
        where: { doctorId: account.user.id, channel: "EMAIL" }
      });

      expect(stats.sent).toBe(1);
      expect(delivered.status).toBe(NotificationStatus.SENT);
      expect(delivered.provider).toBe("RESEND");
      expect(delivered.providerMessageId).toBe("email_integration_123");

      const [, init] = fetchMock.mock.calls[0]!;
      if (!init) {
        throw new Error("Expected Resend fetch options.");
      }
      const payload = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(payload.to).toEqual(["paciente@example.com"]);
      expect(payload.text).toContain("123456");
    } finally {
      env.EMAIL_PROVIDER = originalEmailProvider;
      env.EMAIL_BASE_URL = originalEmailBaseUrl;
      env.EMAIL_API_KEY = originalEmailApiKey;
      env.EMAIL_FROM = originalEmailFrom;
      globalThis.fetch = originalFetch;
      await cleanupUserByEmail(email);
    }
  });

  it("delivers pending WhatsApp messages through Twilio official WhatsApp when enabled", async () => {
    const email = uniqueEmail("doctor-whatsapp");
    const originalWhatsAppProvider = env.WHATSAPP_PROVIDER;
    const originalSmsBaseUrl = env.SMS_BASE_URL;
    const originalTwilioAccountSid = env.TWILIO_ACCOUNT_SID;
    const originalTwilioAuthToken = env.TWILIO_AUTH_TOKEN;
    const originalTwilioWhatsAppMessagingServiceSid = env.TWILIO_WHATSAPP_MESSAGING_SERVICE_SID;
    const originalTwilioWhatsAppFromPhoneNumber = env.TWILIO_WHATSAPP_FROM_PHONE_NUMBER;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ sid: "SMwhatsappIntegration123", status: "queued" }), { status: 201 });
    });
    const originalFetch = globalThis.fetch;

    try {
      env.WHATSAPP_PROVIDER = "twilio";
      env.SMS_BASE_URL = "https://api.twilio.com";
      env.TWILIO_ACCOUNT_SID = "ACintegration";
      env.TWILIO_AUTH_TOKEN = "integration-token";
      env.TWILIO_WHATSAPP_MESSAGING_SERVICE_SID = undefined;
      env.TWILIO_WHATSAPP_FROM_PHONE_NUMBER = "+14155238886";
      globalThis.fetch = fetchMock as typeof fetch;

      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Irene",
        lastName: "Salas",
        professionalName: "Dra. Irene Salas",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      // El registro encola una notificación de verificación de correo; la quitamos
      // para que la cola procese únicamente la notificación bajo prueba.
      await prisma.notification.deleteMany({ where: { doctorId: account.user.id } });

      await prisma.notification.create({
        data: {
          doctorId: account.user.id,
          channel: "WHATSAPP",
          kind: NotificationKind.APPOINTMENT_REMINDER,
          destination: "+526141234567",
          body: "Recordatorio: tienes una cita. Ver detalles: https://midoc.example/s/abc",
          status: NotificationStatus.PENDING,
          metadata: { consent: "patient-whatsapp-reminders" }
        }
      });

      const stats = await processNotificationQueue({ doctorId: account.user.id });
      const delivered = await prisma.notification.findFirstOrThrow({
        where: { doctorId: account.user.id, channel: "WHATSAPP" }
      });

      expect(stats.sent).toBe(1);
      expect(delivered.status).toBe(NotificationStatus.SENT);
      expect(delivered.provider).toBe("TWILIO_WHATSAPP");
      expect(delivered.providerMessageId).toBe("SMwhatsappIntegration123");

      const [, init] = fetchMock.mock.calls[0]!;
      if (!init) {
        throw new Error("Expected Twilio fetch options.");
      }
      const params = new URLSearchParams(init.body as string);
      expect(params.get("To")).toBe("whatsapp:+526141234567");
      expect(params.get("From")).toBe("whatsapp:+14155238886");
    } finally {
      env.WHATSAPP_PROVIDER = originalWhatsAppProvider;
      env.SMS_BASE_URL = originalSmsBaseUrl;
      env.TWILIO_ACCOUNT_SID = originalTwilioAccountSid;
      env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
      env.TWILIO_WHATSAPP_MESSAGING_SERVICE_SID = originalTwilioWhatsAppMessagingServiceSid;
      env.TWILIO_WHATSAPP_FROM_PHONE_NUMBER = originalTwilioWhatsAppFromPhoneNumber;
      globalThis.fetch = originalFetch;
      await cleanupUserByEmail(email);
    }
  });
});
