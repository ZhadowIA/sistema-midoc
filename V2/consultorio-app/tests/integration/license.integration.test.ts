import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { LicenseSource, PrismaClient, UserRole } from "@prisma/client";

import { POST as activateRoute } from "../../src/app/api/sync/license/route";
import { env } from "../../src/lib/env";
import {
  generateSigningSeed,
  publicKeyBase64,
  signingKeyFromSeed,
  verifyLicense
} from "../../src/lib/security/license-token";
import { createDoctorAccount } from "../../src/services/auth/auth-service";
import {
  activateLicense,
  getLicenseOverview,
  grantLicense,
  releaseActivation
} from "../../src/services/license/license-service";
import { linkSyncDevice } from "../../src/services/sync/sync-service";
import { approveDoctorAccountForTesting } from "../helpers/doctor-accounts";

const prisma = new PrismaClient();
const KID = "test-license-kid";
const SEED = generateSigningSeed();
const PUBLIC_KEYS = { [KID]: publicKeyBase64(signingKeyFromSeed(KID, SEED)) };
const createdEmails: string[] = [];
const original = { key: env.LICENSE_SIGNING_KEY, kid: env.LICENSE_SIGNING_KID };

async function createDoctor(label: string) {
  const email = `${label}-${randomUUID()}@example.com`;
  createdEmails.push(email);
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
  const link = await linkSyncDevice(account.user.id, "PC consultorio");
  const device = await prisma.syncDevice.findUniqueOrThrow({ where: { id: link.device.id } });
  return { userId: account.user.id, device, deviceToken: link.deviceToken };
}

function activationRequest(token: string, body: unknown) {
  return new Request("http://localhost/api/sync/license", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeAll(async () => {
  await prisma.$connect();
  env.LICENSE_SIGNING_KEY = SEED;
  env.LICENSE_SIGNING_KID = KID;
});

afterEach(() => {
  env.LICENSE_SIGNING_KEY = SEED;
  env.LICENSE_SIGNING_KID = KID;
});

afterAll(async () => {
  env.LICENSE_SIGNING_KEY = original.key;
  env.LICENSE_SIGNING_KID = original.kid;
  for (const email of createdEmails) {
    const user = await prisma.user.findUnique({ where: { email }, include: { doctorProfile: true } });
    if (!user) continue;
    if (user.doctorProfile) {
      await prisma.doctorSubscription.deleteMany({ where: { doctorProfileId: user.doctorProfile.id } });
    }
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
});

describe("license grant (paso 29)", () => {
  it("grants twelve months of updates once per account", async () => {
    const doctor = await createDoctor("license-grant");
    const license = await grantLicense({
      actorUserId: null,
      doctorUserId: doctor.userId,
      source: LicenseSource.PILOT,
      purchasedAt: new Date("2026-10-06T18:00:00Z")
    });
    expect(license.maxDevices).toBe(2);
    expect(license.updatesUntil.toISOString().slice(0, 10)).toBe("2027-10-06");

    await expect(
      grantLicense({ actorUserId: null, doctorUserId: doctor.userId, source: LicenseSource.GRANT })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses accounts that are not doctors and invalid device limits", async () => {
    const admin = await prisma.user.create({
      data: { email: `admin-${randomUUID()}@example.com`, role: UserRole.ADMIN, firstName: "A", lastName: "B" }
    });
    createdEmails.push(admin.email);
    await expect(
      grantLicense({ actorUserId: null, doctorUserId: admin.id, source: LicenseSource.GRANT })
    ).rejects.toMatchObject({ status: 404 });

    const doctor = await createDoctor("license-limit");
    await expect(
      grantLicense({ actorUserId: null, doctorUserId: doctor.userId, source: LicenseSource.GRANT, maxDevices: 0 })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("license activation (paso 29)", () => {
  it("issues a license the app can verify offline, bound to the installation", async () => {
    const doctor = await createDoctor("license-activate");
    await grantLicense({ actorUserId: null, doctorUserId: doctor.userId, source: LicenseSource.PILOT });
    const installationId = randomUUID();

    const result = await activateLicense(doctor.device, { installationId });
    expect(result.activeDevices).toBe(1);
    const payload = verifyLicense(result.license, PUBLIC_KEYS);
    expect(payload).toMatchObject({
      kid: KID,
      accountId: doctor.userId,
      installationId,
      holderName: "Dra. Eva Soto",
      holderLicenseNumber: "1234567",
      maxDevices: 2,
      updatesUntil: result.updatesUntil
    });

    // Refrescar (cada sincronizacion) no ocupa otro lugar ni cambia la activacion.
    const refreshed = await activateLicense(doctor.device, { installationId });
    expect(refreshed.activeDevices).toBe(1);
    expect(verifyLicense(refreshed.license, PUBLIC_KEYS).activationId).toBe(payload.activationId);
  });

  it("enforces the device limit and lets a released device make room", async () => {
    const doctor = await createDoctor("license-devices");
    await grantLicense({ actorUserId: null, doctorUserId: doctor.userId, source: LicenseSource.PILOT });
    const [first, second, third] = [randomUUID(), randomUUID(), randomUUID()];

    await activateLicense(doctor.device, { installationId: first, deviceName: "Consultorio" });
    await activateLicense(doctor.device, { installationId: second, deviceName: "Casa" });
    await expect(activateLicense(doctor.device, { installationId: third })).rejects.toMatchObject({ status: 409 });

    const overview = await getLicenseOverview(doctor.userId);
    expect(overview.license?.devices.map((d) => d.deviceName)).toEqual(["Consultorio", "Casa"]);

    await releaseActivation(doctor.userId, overview.license!.devices[0].id);
    const third_ = await activateLicense(doctor.device, { installationId: third });
    expect(third_.activeDevices).toBe(2);

    // El equipo liberado puede volver si hay lugar; aqui ya no lo hay.
    await expect(activateLicense(doctor.device, { installationId: first })).rejects.toMatchObject({ status: 409 });
  });

  it("never exceeds the limit when several devices activate at once", async () => {
    const doctor = await createDoctor("license-race");
    await grantLicense({ actorUserId: null, doctorUserId: doctor.userId, source: LicenseSource.PILOT });

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () => activateLicense(doctor.device, { installationId: randomUUID() }))
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(2);
    expect(attempts.filter((a) => a.status === "rejected").every((a) => (a as PromiseRejectedResult).reason.status === 409)).toBe(true);
    const active = await prisma.licenseActivation.count({
      where: { license: { doctorId: doctor.userId }, releasedAt: null }
    });
    expect(active).toBe(2);
  });

  it("refuses accounts without a license and portals without a signing key", async () => {
    const doctor = await createDoctor("license-none");
    await expect(activateLicense(doctor.device, { installationId: randomUUID() })).rejects.toMatchObject({
      status: 402
    });

    env.LICENSE_SIGNING_KEY = undefined;
    env.LICENSE_SIGNING_KID = undefined;
    await expect(activateLicense(doctor.device, { installationId: randomUUID() })).rejects.toMatchObject({
      status: 503
    });
  });

  it("does not let one account release another account's device", async () => {
    const owner = await createDoctor("license-owner");
    const stranger = await createDoctor("license-stranger");
    await grantLicense({ actorUserId: null, doctorUserId: owner.userId, source: LicenseSource.PILOT });
    await activateLicense(owner.device, { installationId: randomUUID() });
    const overview = await getLicenseOverview(owner.userId);
    await expect(releaseActivation(stranger.userId, overview.license!.devices[0].id)).rejects.toMatchObject({
      status: 404
    });
  });
});

describe("POST /api/sync/license", () => {
  it("activates with a device token and rejects bad tokens and bodies", async () => {
    const doctor = await createDoctor("license-route");
    await grantLicense({ actorUserId: null, doctorUserId: doctor.userId, source: LicenseSource.PILOT });
    const installationId = randomUUID();

    const ok = await activateRoute(activationRequest(doctor.deviceToken, { installationId }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(verifyLicense(body.license, PUBLIC_KEYS).installationId).toBe(installationId);

    const unauthorized = await activateRoute(activationRequest("token-falso", { installationId }));
    expect(unauthorized.status).toBe(401);

    const invalid = await activateRoute(activationRequest(doctor.deviceToken, { installationId: "no-es-uuid" }));
    expect(invalid.status).toBe(400);
  });
});
