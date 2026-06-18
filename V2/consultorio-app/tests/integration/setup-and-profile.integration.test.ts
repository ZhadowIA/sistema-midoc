import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClinicalProfile, PrismaClient } from "@prisma/client";
import { approveDoctorAccountForTesting } from "../helpers/doctor-accounts";

import {
  createDoctorAccount,
  createDoctorSubscription,
  getDoctorSetupStatus
} from "../../src/services/auth/auth-service";
import {
  createAvailabilityBlock,
  createAvailabilityRule,
  createDoctorService,
  deleteAvailabilityBlock,
  deleteAvailabilityRule,
  getPublicDoctorProfile,
  setAvailabilityRuleActive,
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
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      expect(await getDoctorSetupStatus(account.user.id)).toMatchObject({
        nextStep: "SUBSCRIPTION",
        emailVerified: false,
        approvalStatus: "PENDING_APPROVAL",
        canPublishProfile: false
      });

      await createDoctorSubscription({
        doctorUserId: account.user.id,
        planCode: "ESSENTIAL"
      });

      expect(await getDoctorSetupStatus(account.user.id)).toMatchObject({
        nextStep: "ONBOARDING"
      });

      await approveDoctorAccountForTesting(prisma, account.user.id);

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
        licenseNumber: "1234567",
        specialty: "ODONTOLOGY",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await createDoctorSubscription({
        doctorUserId: account.user.id,
        planCode: "ESSENTIAL"
      });

      await approveDoctorAccountForTesting(prisma, account.user.id);

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

      const blockStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      blockStart.setUTCHours(10, 0, 0, 0);
      const blockEnd = new Date(blockStart);
      blockEnd.setUTCHours(12, 0, 0, 0);

      await createAvailabilityBlock(account.user.id, {
        startsAt: blockStart.toISOString(),
        endsAt: blockEnd.toISOString(),
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

  it("rejects a duplicate public slug with a conflict error", async () => {
    const emailA = uniqueEmail("doctor-slug-a");
    const emailB = uniqueEmail("doctor-slug-b");
    const slug = uniqueSlug("dr-slug-compartido");

    try {
      const accountA = await createDoctorAccount({
        email: emailA,
        password: "Str0ngPass!123",
        firstName: "Marta",
        lastName: "Lopez",
        professionalName: "Dra. Marta Lopez",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });
      const accountB = await createDoctorAccount({
        email: emailB,
        password: "Str0ngPass!123",
        firstName: "Hugo",
        lastName: "Reyes",
        professionalName: "Dr. Hugo Reyes",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await updateDoctorProfile(accountA.user.id, { publicSlug: slug });

      await expect(
        updateDoctorProfile(accountB.user.id, { publicSlug: slug })
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      await cleanupUserByEmail(emailA);
      await cleanupUserByEmail(emailB);
    }
  });

  it("blocks public profile publication until email is verified and account is active", async () => {
    const email = uniqueEmail("doctor-publication-gate");
    const slug = uniqueSlug("dra-gate");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Laura",
        lastName: "Nieves",
        professionalName: "Dra. Laura Nieves",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await expect(
        updateDoctorProfile(account.user.id, {
          publicSlug: slug,
          isPublic: true
        })
      ).rejects.toMatchObject({ status: 403 });

      await approveDoctorAccountForTesting(prisma, account.user.id);
      const profile = await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        isPublic: true
      });

      expect(profile.isPublic).toBe(true);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("rejects overlapping availability rules on the same day", async () => {
    const email = uniqueEmail("doctor-overlap");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Nora",
        lastName: "Campos",
        professionalName: "Dra. Nora Campos",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: 3,
        startTime: "09:00",
        endTime: "13:00"
      });

      await expect(
        createAvailabilityRule(account.user.id, {
          dayOfWeek: 3,
          startTime: "12:00",
          endTime: "15:00"
        })
      ).rejects.toMatchObject({ status: 409 });

      // Adjacent (non-overlapping) range on the same day is fine.
      await createAvailabilityRule(account.user.id, {
        dayOfWeek: 3,
        startTime: "13:00",
        endTime: "17:00"
      });
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("lets the doctor deactivate and delete availability rules and blocks", async () => {
    const email = uniqueEmail("doctor-edit-availability");
    const slug = uniqueSlug("dra-edicion");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Iris",
        lastName: "Duarte",
        professionalName: "Dra. Iris Duarte",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await approveDoctorAccountForTesting(prisma, account.user.id);

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        isPublic: true
      });

      const rule = await createAvailabilityRule(account.user.id, {
        dayOfWeek: 4,
        startTime: "09:00",
        endTime: "12:00"
      });
      const block = await createAvailabilityBlock(account.user.id, {
        startsAt: "2027-01-05T09:00:00.000Z",
        endsAt: "2027-01-05T10:00:00.000Z"
      });

      await setAvailabilityRuleActive(account.user.id, rule.id, false);
      const profileWhileInactive = await getPublicDoctorProfile(slug);
      expect(profileWhileInactive?.availability).toHaveLength(0);

      await deleteAvailabilityBlock(account.user.id, block.id);
      await deleteAvailabilityRule(account.user.id, rule.id);

      const remaining = await prisma.doctorAvailability.findFirst({
        where: { id: rule.id }
      });
      expect(remaining).toBeNull();

      // Another doctor's rule must be untouchable.
      await expect(
        deleteAvailabilityRule(account.user.id, rule.id)
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});
