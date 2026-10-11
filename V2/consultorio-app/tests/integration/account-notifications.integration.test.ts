import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NotificationKind, NotificationStatus, PrismaClient } from "@prisma/client";

import {
  createDoctorAccount,
  requestDoctorEmailVerification,
  requestPasswordReset
} from "../../src/services/auth/auth-service";
import { queueNotification, sendAccountNotification } from "../../src/services/notifications/notification-service";

// Los correos de la cuenta del medico (verificar correo, recuperar contrasena)
// salen en el momento: no dependen de la cola de notificaciones, que esta
// congelada junto con las notificaciones al paciente (paso 27).

const prisma = new PrismaClient();
const createdEmails: string[] = [];

async function createDoctor(label: string) {
  const email = `${label}-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const account = await createDoctorAccount({
    email,
    password: "Str0ngPass!123",
    firstName: "Rita",
    lastName: "Ochoa",
    professionalName: "Dra. Rita Ochoa",
    licenseNumber: "1234567",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });
  return account.user;
}

async function latest(doctorId: string, kind: NotificationKind) {
  return prisma.notification.findFirstOrThrow({
    where: { doctorId, kind },
    orderBy: { createdAt: "desc" }
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  for (const email of createdEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.notification.deleteMany({ where: { doctorId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
  await prisma.$disconnect();
});

describe("account emails go out immediately", () => {
  it("sends the email verification without waiting for the queue", async () => {
    const doctor = await createDoctor("account-verify");

    await requestDoctorEmailVerification({ userId: doctor.id });

    const notification = await latest(doctor.id, NotificationKind.EMAIL_VERIFICATION);
    expect(notification.status).toBe(NotificationStatus.SENT);
    expect(notification.sentAt).not.toBeNull();
    expect(notification.providerMessageId).toBeTruthy();
  });

  it("sends the password reset link without waiting for the queue", async () => {
    const doctor = await createDoctor("account-reset");

    await requestPasswordReset({ email: doctor.email });

    const notification = await latest(doctor.id, NotificationKind.PASSWORD_RESET);
    expect(notification.status).toBe(NotificationStatus.SENT);
  });

  it("keeps the request working when the provider fails, leaving the email for retry", async () => {
    const doctor = await createDoctor("account-provider-down");

    const notification = await sendAccountNotification({
      doctorId: doctor.id,
      channel: "EMAIL",
      kind: NotificationKind.EMAIL_VERIFICATION,
      destination: doctor.email,
      actionUrl: "https://midoc.example/verificar-correo?token=x",
      template: { expiresAt: new Date(Date.now() + 60_000) },
      metadata: { mockFailTimes: 1 }
    });

    expect(notification.status).toBe(NotificationStatus.RETRIED);
    expect(notification.lastError).toBeTruthy();
  });

  it("only sends account emails right away; patient notifications stay queued", async () => {
    const doctor = await createDoctor("account-scope");

    await expect(
      sendAccountNotification({
        doctorId: doctor.id,
        channel: "EMAIL",
        kind: NotificationKind.APPOINTMENT_REMINDER,
        destination: "paciente@example.com",
        template: {}
      })
    ).rejects.toMatchObject({ status: 400 });

    const queued = await queueNotification({
      doctorId: doctor.id,
      channel: "EMAIL",
      kind: NotificationKind.APPOINTMENT_REMINDER,
      destination: "paciente@example.com",
      template: {}
    });
    expect(queued.status).toBe(NotificationStatus.PENDING);
  });
});
