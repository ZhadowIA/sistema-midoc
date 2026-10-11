import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LicenseSource, PrismaClient, SyncDeviceStatus, SyncEventType } from "@prisma/client";
import { approveDoctorAccountForTesting } from "../helpers/doctor-accounts";

import { DELETE as unlinkRoute } from "../../src/app/api/sync/devices/route";
import { createDoctorAccount } from "../../src/services/auth/auth-service";
import { grantLicense } from "../../src/services/license/license-service";
import {
  ackSyncEvents,
  authenticateSyncDevice,
  emitSyncEvent,
  getSyncInbox,
  linkSyncDevice
} from "../../src/services/sync/sync-service";

// Varios equipos por licencia: hasta `maxDevices` sincronizan a la vez; al
// vincular uno de mas se revoca el que lleva mas tiempo sin contacto. El buzon
// (purga al confirmar, documentos cifrados para una llave) es solo del equipo
// principal: el ultimo vinculado.

const prisma = new PrismaClient();
const createdEmails: string[] = [];

async function createDoctor(label: string, maxDevices?: number) {
  const email = `${label}-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const account = await createDoctorAccount({
    email,
    password: "Str0ngPass!123",
    firstName: "Ines",
    lastName: "Vela",
    professionalName: "Dra. Ines Vela",
    licenseNumber: "1234567",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });
  await approveDoctorAccountForTesting(prisma, account.user.id);
  if (maxDevices !== undefined) {
    await grantLicense({ actorUserId: null, doctorUserId: account.user.id, source: LicenseSource.PILOT, maxDevices });
  }
  return account.user.id;
}

async function activeDeviceIds(doctorId: string) {
  const devices = await prisma.syncDevice.findMany({
    where: { doctorId, status: SyncDeviceStatus.ACTIVE },
    select: { id: true }
  });
  return devices.map((device) => device.id).sort();
}

async function setLastContact(deviceId: string, minutesAgo: number) {
  await prisma.syncDevice.update({
    where: { id: deviceId },
    data: { lastSyncAt: new Date(Date.now() - minutesAgo * 60_000) }
  });
}

function bearer(token: string) {
  return new Request("http://localhost/api/sync/devices", {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` }
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  for (const email of createdEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.syncEvent.deleteMany({ where: { doctorId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
  await prisma.$disconnect();
});

describe("sync devices per license", () => {
  it("keeps as many devices syncing as the license allows", async () => {
    const doctorId = await createDoctor("devices-two", 2);

    const office = await linkSyncDevice(doctorId, "Consultorio");
    const laptop = await linkSyncDevice(doctorId, "Laptop");

    expect(await activeDeviceIds(doctorId)).toEqual([office.device.id, laptop.device.id].sort());
  });

  it("revokes the device with the oldest contact when one more is linked", async () => {
    const doctorId = await createDoctor("devices-third", 2);
    const office = await linkSyncDevice(doctorId, "Consultorio");
    const laptop = await linkSyncDevice(doctorId, "Laptop");
    // La laptop lleva una semana sin contacto; el consultorio sincronizo hoy.
    await setLastContact(laptop.device.id, 7 * 24 * 60);
    await setLastContact(office.device.id, 10);

    const replacement = await linkSyncDevice(doctorId, "PC nueva");

    expect(await activeDeviceIds(doctorId)).toEqual([office.device.id, replacement.device.id].sort());
    await expect(authenticateSyncDevice(bearer(laptop.deviceToken))).rejects.toMatchObject({ status: 401 });
  });

  it("keeps a single device without a license, as before", async () => {
    const doctorId = await createDoctor("devices-no-license");
    await linkSyncDevice(doctorId, "Primero");
    const second = await linkSyncDevice(doctorId, "Segundo");

    expect(await activeDeviceIds(doctorId)).toEqual([second.device.id]);
  });

  it("never exceeds the limit when devices are linked at the same time", async () => {
    const doctorId = await createDoctor("devices-race", 2);

    await Promise.all(Array.from({ length: 5 }, (_, i) => linkSyncDevice(doctorId, `Equipo ${i}`)));

    expect(await activeDeviceIds(doctorId)).toHaveLength(2);
  });

  it("records contact on authenticated calls so the oldest one is known", async () => {
    const doctorId = await createDoctor("devices-contact", 2);
    const link = await linkSyncDevice(doctorId, "Consultorio");
    await setLastContact(link.device.id, 60);

    await authenticateSyncDevice(bearer(link.deviceToken));

    const device = await prisma.syncDevice.findUniqueOrThrow({ where: { id: link.device.id } });
    expect(Date.now() - device.lastSyncAt!.getTime()).toBeLessThan(60_000);
  });
});

describe("mailbox belongs to the primary device", () => {
  it("delivers and purges only through the last linked device", async () => {
    const doctorId = await createDoctor("devices-mailbox", 2);
    const older = await linkSyncDevice(doctorId, "Consultorio");
    const primary = await linkSyncDevice(doctorId, "Laptop");
    const event = await emitSyncEvent(doctorId, SyncEventType.PRECHECKIN_SUBMITTED, { precheckinId: "pre-1" });

    // El equipo secundario no ve el buzon ni puede purgarlo.
    const secondaryInbox = await getSyncInbox(older.device, 0);
    expect(secondaryInbox.events).toEqual([]);
    expect(secondaryInbox.primary).toBe(false);
    await ackSyncEvents(older.device, event.seq);
    const untouched = await prisma.syncEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(untouched.payload).not.toBeNull();

    const primaryInbox = await getSyncInbox(primary.device, 0);
    expect(primaryInbox.primary).toBe(true);
    expect(primaryInbox.events.map((e) => e.seq)).toEqual([event.seq]);
  });
});

describe("unlinking from the app", () => {
  it("revokes the device in the portal so it stops holding a slot", async () => {
    const doctorId = await createDoctor("devices-unlink", 2);
    const link = await linkSyncDevice(doctorId, "Consultorio");

    const response = await unlinkRoute(bearer(link.deviceToken));
    expect(response.status).toBe(200);
    expect(await activeDeviceIds(doctorId)).toEqual([]);

    const again = await unlinkRoute(bearer(link.deviceToken));
    expect(again.status).toBe(401);
  });
});
