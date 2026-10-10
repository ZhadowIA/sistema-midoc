import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";
import { approveDoctorAccountForTesting } from "../helpers/doctor-accounts";

import { GET as webGet, PUT as webPut } from "../../src/app/api/admin/profile/prescriber/route";
import { GET as syncGet, PUT as syncPut } from "../../src/app/api/sync/profile/route";
import { SESSION_COOKIE_NAME } from "../../src/lib/auth/session-cookie";
import { createDoctorAccount, createSessionForUser } from "../../src/services/auth/auth-service";
import {
  getPrescriberProfile,
  updatePrescriberProfile
} from "../../src/services/doctor/prescriber-profile-service";
import { linkSyncDevice } from "../../src/services/sync/sync-service";

// Datos del medico para la receta (regla 4.6): se capturan desde la web o desde
// la app, el portal manda y las escrituras usan concurrencia optimista.

const prisma = new PrismaClient();
const createdEmails: string[] = [];

async function createDoctor(label: string) {
  const email = `${label}-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const account = await createDoctorAccount({
    email,
    password: "Str0ngPass!123",
    firstName: "Elsa",
    lastName: "Rios",
    professionalName: "Dra. Elsa Rios",
    licenseNumber: "1234567",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });
  await approveDoctorAccountForTesting(prisma, account.user.id);
  return account.user;
}

function prescriberInput(expectedUpdatedAt: string, overrides: Record<string, unknown> = {}) {
  return {
    professionalName: "Dra. Elsa Rios Luna",
    licenseNumber: "7654321",
    degreeInstitution: "Universidad Autonoma de Chihuahua",
    specialtyTitle: "Pediatria",
    specialtyLicenseNumber: "11223344",
    addressLine1: "Av. Juarez 100, consultorio 3",
    addressLine2: null,
    city: "Chihuahua",
    state: "Chihuahua",
    postalCode: "31000",
    expectedUpdatedAt,
    ...overrides
  };
}

function jsonRequest(url: string, method: string, headers: Record<string, string>, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  for (const email of createdEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
  await prisma.$disconnect();
});

describe("prescriber profile service", () => {
  it("reads the prescriber data with the version the client must send back", async () => {
    const doctor = await createDoctor("prescriber-read");

    const profile = await getPrescriberProfile(doctor.id);

    expect(profile.professionalName).toBe("Dra. Elsa Rios");
    expect(profile.licenseNumber).toBe("1234567");
    expect(profile.degreeInstitution).toBeNull();
    expect(profile.specialtyTitle).toBeNull();
    expect(Number.isNaN(Date.parse(profile.updatedAt))).toBe(false);
  });

  it("updates every field when the version matches and returns a new version", async () => {
    const doctor = await createDoctor("prescriber-update");
    const before = await getPrescriberProfile(doctor.id);

    const after = await updatePrescriberProfile(doctor.id, prescriberInput(before.updatedAt), "web");

    expect(after).toMatchObject({
      professionalName: "Dra. Elsa Rios Luna",
      licenseNumber: "7654321",
      degreeInstitution: "Universidad Autonoma de Chihuahua",
      specialtyTitle: "Pediatria",
      specialtyLicenseNumber: "11223344",
      addressLine1: "Av. Juarez 100, consultorio 3",
      city: "Chihuahua",
      state: "Chihuahua",
      postalCode: "31000"
    });
    expect(after.updatedAt).not.toBe(before.updatedAt);
  });

  it("rejects a stale version with 409 and keeps what the other side saved", async () => {
    const doctor = await createDoctor("prescriber-stale");
    const read = await getPrescriberProfile(doctor.id);
    await updatePrescriberProfile(doctor.id, prescriberInput(read.updatedAt, { city: "Delicias" }), "web");

    // La app todavia tiene la version que leyo antes del cambio desde la web.
    await expect(
      updatePrescriberProfile(doctor.id, prescriberInput(read.updatedAt, { city: "Parral" }), "desktop")
    ).rejects.toMatchObject({ status: 409 });

    expect((await getPrescriberProfile(doctor.id)).city).toBe("Delicias");
  });

  it("lets only one of two concurrent writers with the same version win", async () => {
    const doctor = await createDoctor("prescriber-race");
    const read = await getPrescriberProfile(doctor.id);

    const results = await Promise.allSettled([
      updatePrescriberProfile(doctor.id, prescriberInput(read.updatedAt, { city: "Web" }), "web"),
      updatePrescriberProfile(doctor.id, prescriberInput(read.updatedAt, { city: "App" }), "desktop")
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({ status: 409 });
  });

  it("normalizes and validates the professional license", async () => {
    const doctor = await createDoctor("prescriber-license");
    const read = await getPrescriberProfile(doctor.id);

    await expect(
      updatePrescriberProfile(doctor.id, prescriberInput(read.updatedAt, { licenseNumber: "12" }), "web")
    ).rejects.toMatchObject({ status: 400 });

    const saved = await updatePrescriberProfile(
      doctor.id,
      prescriberInput(read.updatedAt, { licenseNumber: " ab  123456 " }),
      "web"
    );
    expect(saved.licenseNumber).toBe("AB 123456");
  });
});

describe("prescriber profile routes", () => {
  it("edits from the web with the doctor's session", async () => {
    const doctor = await createDoctor("prescriber-web-route");
    const { sessionToken } = await createSessionForUser(doctor, "test.session");
    const cookie = { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` };
    const url = "http://localhost/api/admin/profile/prescriber";

    const read = await webGet(jsonRequest(url, "GET", cookie));
    expect(read.status).toBe(200);
    const { prescriber } = await read.json();

    const saved = await webPut(jsonRequest(url, "PUT", cookie, prescriberInput(prescriber.updatedAt)));
    expect(saved.status).toBe(200);
    expect((await saved.json()).prescriber.specialtyTitle).toBe("Pediatria");

    const stale = await webPut(jsonRequest(url, "PUT", cookie, prescriberInput(prescriber.updatedAt)));
    expect(stale.status).toBe(409);

    const anonymous = await webPut(jsonRequest(url, "PUT", {}, prescriberInput(prescriber.updatedAt)));
    expect(anonymous.status).toBe(401);
  });

  it("edits from the desktop app with the device token and serves the change on sync", async () => {
    const doctor = await createDoctor("prescriber-sync-route");
    const { deviceToken } = await linkSyncDevice(doctor.id, "PC consultorio");
    const bearer = { authorization: `Bearer ${deviceToken}` };
    const url = "http://localhost/api/sync/profile";

    const read = await syncGet(jsonRequest(url, "GET", bearer));
    expect(read.status).toBe(200);
    const body = await read.json();
    // El perfil que ya consumian las versiones anteriores de la app no cambia.
    expect(body.profile.licenseNumber).toBe("1234567");

    const saved = await syncPut(jsonRequest(url, "PUT", bearer, prescriberInput(body.prescriber.updatedAt)));
    expect(saved.status).toBe(200);

    const reread = await (await syncGet(jsonRequest(url, "GET", bearer))).json();
    expect(reread.prescriber).toMatchObject({
      degreeInstitution: "Universidad Autonoma de Chihuahua",
      specialtyLicenseNumber: "11223344"
    });

    const stale = await syncPut(jsonRequest(url, "PUT", bearer, prescriberInput(body.prescriber.updatedAt)));
    expect(stale.status).toBe(409);

    const invalid = await syncPut(jsonRequest(url, "PUT", bearer, { city: "Sin version" }));
    expect(invalid.status).toBe(400);

    const unauthorized = await syncPut(
      jsonRequest(url, "PUT", { authorization: "Bearer token-falso" }, prescriberInput(body.prescriber.updatedAt))
    );
    expect(unauthorized.status).toBe(401);
  });
});
