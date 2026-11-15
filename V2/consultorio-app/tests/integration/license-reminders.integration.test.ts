import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LicenseSource, NotificationKind, NotificationStatus, PrismaClient } from "@prisma/client";

import { GET as remindersRoute } from "../../src/app/api/internal/license/reminders/route";
import { env } from "../../src/lib/env";
import { createDoctorAccount } from "../../src/services/auth/auth-service";
import { sendUpdatesEndingReminders } from "../../src/services/license/updates-reminder-service";

// Aviso por correo de fin de actualizaciones (decision del 2026-10-18): sale a
// 30 y a 7 dias, una vez cada uno, solo a correos verificados.

const prisma = new PrismaClient();
const createdEmails: string[] = [];
const DAY = 86_400_000;

async function doctorWithLicense(label: string, daysLeft: number, verified = true) {
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
  await prisma.user.update({
    where: { id: account.user.id },
    data: { emailVerifiedAt: verified ? new Date() : null }
  });
  await prisma.license.create({
    data: {
      doctorId: account.user.id,
      source: LicenseSource.GRANT,
      purchasedAt: new Date(Date.now() - 300 * DAY),
      updatesUntil: new Date(Date.now() + daysLeft * DAY)
    }
  });
  return account.user.id;
}

function reminders(doctorId: string) {
  return prisma.notification.findMany({
    where: { doctorId, kind: NotificationKind.LICENSE_UPDATES_ENDING },
    orderBy: { createdAt: "asc" }
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

describe("aviso de fin de actualizaciones", () => {
  it("sale una vez a 30 dias y no se repite al dia siguiente", async () => {
    const doctorId = await doctorWithLicense("reminder-30", 20);
    await sendUpdatesEndingReminders();
    await sendUpdatesEndingReminders();

    const sent = await reminders(doctorId);
    expect(sent).toHaveLength(1);
    expect(sent[0].status).toBe(NotificationStatus.SENT);
    expect(sent[0].metadata).toMatchObject({ window: 30 });
    expect(sent[0].body).toContain("siguen funcionando");
    expect(sent[0].body).toContain("/medico/cuenta");
  });

  it("a 7 dias manda el segundo aviso aunque ya se mando el de 30", async () => {
    const doctorId = await doctorWithLicense("reminder-7", 20);
    await sendUpdatesEndingReminders();
    await prisma.license.update({
      where: { doctorId },
      data: { updatesUntil: new Date(Date.now() + 5 * DAY) }
    });
    // La fecha de fin cambio: la ventana se cuenta por fecha, asi que si se
    // renovo y vuelve a acercarse el fin, se avisa de nuevo.
    await sendUpdatesEndingReminders();
    await sendUpdatesEndingReminders();

    const windows = (await reminders(doctorId)).map((n) => (n.metadata as { window: number }).window);
    expect(windows).toEqual([30, 7]);
  });

  it("no escribe con mas de 30 dias por delante ni a correos sin verificar", async () => {
    const far = await doctorWithLicense("reminder-far", 120);
    const unverified = await doctorWithLicense("reminder-unverified", 10, false);
    await sendUpdatesEndingReminders();

    expect(await reminders(far)).toHaveLength(0);
    expect(await reminders(unverified)).toHaveLength(0);
  });

  it("la ruta del cron exige su secreto", async () => {
    const denied = await remindersRoute(new Request("http://localhost/api/internal/license/reminders"));
    expect(denied.status).toBe(401);

    const allowed = await remindersRoute(
      new Request("http://localhost/api/internal/license/reminders", {
        headers: { authorization: `Bearer ${env.NOTIFICATION_CRON_SECRET}` }
      })
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ stats: expect.any(Object) });
  });
});
