import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, UserRole, UserStatus } from "@prisma/client";

import { hashPassword } from "../../src/lib/security/password";
import { createDoctorAccount } from "../../src/services/auth/auth-service";
import {
  listDoctorAccountsForAdmin,
  signInPlatformAdmin,
  updateDoctorAccountStatus
} from "../../src/services/platform-admin/platform-admin-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
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

  await prisma.user.delete({ where: { id: user.id } });
}

async function createAdminUser(email: string) {
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("AdminPass!2026"),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      firstName: "Admin",
      lastName: "MiDoc"
    }
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("platform admin service", () => {
  it("signs in an active platform admin", async () => {
    const adminEmail = uniqueEmail("platform-admin-login");

    try {
      await createAdminUser(adminEmail);

      const login = await signInPlatformAdmin({
        email: adminEmail,
        password: "AdminPass!2026"
      });

      expect(login.user.role).toBe(UserRole.ADMIN);
      expect(login.sessionToken.length).toBeGreaterThan(20);
    } finally {
      await cleanupUserByEmail(adminEmail);
    }
  });

  it("lists doctors and lets an admin approve or suspend accounts", async () => {
    const adminEmail = uniqueEmail("platform-admin");
    const doctorEmail = uniqueEmail("doctor-pending-approval");

    try {
      const admin = await createAdminUser(adminEmail);
      const doctor = await createDoctorAccount({
        email: doctorEmail,
        password: "Str0ngPass!123",
        firstName: "Sofia",
        lastName: "Marin",
        phone: "6141234500",
        professionalName: "Dra. Sofia Marin",
        licenseNumber: "CED12345",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const pending = await listDoctorAccountsForAdmin(admin.id, { status: UserStatus.PENDING_APPROVAL });
      expect(pending.accounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: doctor.user.id,
            email: doctorEmail,
            status: UserStatus.PENDING_APPROVAL,
            doctorProfile: expect.objectContaining({
              professionalName: "Dra. Sofia Marin",
              isPublic: false
            })
          })
        ])
      );

      const approved = await updateDoctorAccountStatus(admin.id, doctor.user.id, UserStatus.ACTIVE);
      expect(approved.status).toBe(UserStatus.ACTIVE);

      const suspended = await updateDoctorAccountStatus(admin.id, doctor.user.id, UserStatus.SUSPENDED);
      expect(suspended.status).toBe(UserStatus.SUSPENDED);

      const audit = await prisma.auditLog.findFirst({
        where: {
          actorUserId: admin.id,
          entityId: doctor.user.id,
          action: "platform.doctor.status_updated"
        },
        orderBy: { createdAt: "desc" }
      });
      expect(audit).toBeTruthy();
    } finally {
      await cleanupUserByEmail(doctorEmail);
      await cleanupUserByEmail(adminEmail);
    }
  });
});
