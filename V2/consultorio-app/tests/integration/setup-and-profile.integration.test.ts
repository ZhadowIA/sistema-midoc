import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClinicalProfile, PrismaClient } from "@prisma/client";

import {
  createDoctorAccount,
  createDoctorSubscription,
  getDoctorSetupStatus
} from "../../src/services/auth/auth-service";
import {
  createAvailabilityBlock,
  createAvailabilityRule,
  createDoctorService,
  getPublicDoctorProfile,
  updateDoctorProfile
} from "../../src/services/doctor/doctor-profile-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

function uniqueSlug(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}`;
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

  await prisma.user.delete({
    where: { id: user.id }
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("doctor setup and public profile", () => {
  it("moves setup status from subscription to onboarding to dashboard", async () => {
    const email = uniqueEmail("doctor-setup");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Elena",
        lastName: "Vega",
        phone: "6140000100",
        professionalName: "Dra. Elena Vega",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      expect(await getDoctorSetupStatus(account.user.id)).toMatchObject({
        nextStep: "SUBSCRIPTION"
      });

      await createDoctorSubscription({
        doctorUserId: account.user.id,
        planCode: "ESSENTIAL"
      });

      expect(await getDoctorSetupStatus(account.user.id)).toMatchObject({
        nextStep: "ONBOARDING"
      });

      await updateDoctorProfile(account.user.id, {
        publicSlug: uniqueSlug("dra-elena-vega"),
        professionalName: "Dra. Elena Vega",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        description: "Consulta integral para pacientes de primera vez y seguimiento.",
        licenseNumber: "CED-1234567",
        phone: "6140000100",
        addressLine1: "Av. Salud 123",
        city: "Chihuahua",
        state: "Chihuahua",
        country: "Mexico",
        consultationDuration: 45,
        isPublic: true
      });

      await createDoctorService(account.user.id, {
        name: "Consulta general",
        description: "Valoracion medica inicial o de seguimiento.",
        priceCents: 90000,
        durationMinutes: 45,
        displayOrder: 1
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "13:00",
        slotInterval: 45,
        minAdvanceHours: 2,
        maxAdvanceDays: 30
      });

      expect(await getDoctorSetupStatus(account.user.id)).toMatchObject({
        nextStep: "DASHBOARD"
      });
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("returns a public profile with active services and availability only", async () => {
    const email = uniqueEmail("doctor-public-profile");
    const slug = uniqueSlug("dr-luis-ortega");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Luis",
        lastName: "Ortega",
        phone: "6140000101",
        professionalName: "Dr. Luis Ortega",
        specialty: "ODONTOLOGY",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await createDoctorSubscription({
        doctorUserId: account.user.id,
        planCode: "ESSENTIAL"
      });

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        professionalName: "Dr. Luis Ortega",
        specialty: ClinicalProfile.ODONTOLOGY,
        description: "Odontologia preventiva y rehabilitacion estetica.",
        phone: "6140000101",
        city: "Chihuahua",
        state: "Chihuahua",
        country: "Mexico",
        consultationDuration: 60,
        isPublic: true
      });

      await createDoctorService(account.user.id, {
        name: "Limpieza dental",
        description: "Profilaxis y revision general.",
        priceCents: 65000,
        durationMinutes: 60,
        displayOrder: 1
      });

      await createDoctorService(account.user.id, {
        name: "Valoracion interna",
        description: "No visible al publico.",
        priceCents: 50000,
        durationMinutes: 30,
        displayOrder: 2,
        status: "INACTIVE"
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: 2,
        startTime: "10:00",
        endTime: "14:00",
        slotInterval: 60
      });

      await createAvailabilityBlock(account.user.id, {
        startsAt: "2026-06-10T10:00:00.000Z",
        endsAt: "2026-06-10T12:00:00.000Z",
        reason: "Capacitacion"
      });

      const publicProfile = await getPublicDoctorProfile(slug);

      expect(publicProfile?.doctor.professionalName).toBe("Dr. Luis Ortega");
      expect(publicProfile?.doctor.specialty).toBe("ODONTOLOGY");
      expect(publicProfile?.services).toHaveLength(1);
      expect(publicProfile?.services[0]?.name).toBe("Limpieza dental");
      expect(publicProfile?.availability).toHaveLength(1);
      expect(publicProfile?.blocks).toHaveLength(1);
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});
