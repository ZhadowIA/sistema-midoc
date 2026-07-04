import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PlanStatus, PrismaClient, UserRole, UserStatus } from "@prisma/client";

import { hashPassword } from "../../src/lib/security/password";
import { createDoctorAccount } from "../../src/services/auth/auth-service";
import { updateDoctorAiAccess } from "../../src/services/platform-admin/platform-admin-service";

const prisma = new PrismaClient();

// Plan con IA disponible: la habilitacion sin suscripcion vigente debe poder
// asignarlo automaticamente (decision de producto).
const AI_PLAN_CODE = "AI_TEST_PLAN";

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

const createdEmails: string[] = [];

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
  await prisma.authSession.deleteMany({ where: { userId: user.id } });
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

async function registerDoctor(label: string) {
  const email = uniqueEmail(label);
  createdEmails.push(email);
  const account = await createDoctorAccount({
    email,
    password: "Str0ngPass!123",
    firstName: "Ana",
    lastName: "Rios",
    professionalName: "Dra. Ana Rios",
    licenseNumber: "1234567",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });
  return account.user.id;
}

beforeAll(async () => {
  await prisma.$connect();
  await prisma.subscriptionPlan.upsert({
    where: { code: AI_PLAN_CODE },
    update: {
      status: PlanStatus.ACTIVE,
      capabilities: { ai: true, agenda: true, aiCreditsMonthly: 120 }
    },
    create: {
      code: AI_PLAN_CODE,
      name: "Plan IA (test)",
      status: PlanStatus.ACTIVE,
      billingInterval: "monthly",
      priceCents: 0,
      currency: "MXN",
      capabilities: { ai: true, agenda: true, aiCreditsMonthly: 120 }
    }
  });
});

afterAll(async () => {
  for (const email of createdEmails) {
    await cleanupUserByEmail(email);
  }
  await prisma.$disconnect();
});

describe("platform admin AI access (habilitar IA / creditos por medico)", () => {
  it("enables AI for a doctor without a subscription by creating one and overriding credits", async () => {
    const adminEmail = uniqueEmail("aiaccess-admin");
    createdEmails.push(adminEmail);
    const admin = await createAdminUser(adminEmail);
    const doctorId = await registerDoctor("aiaccess-none");

    // Precondicion: el medico arranca sin suscripcion -> IA gateada.
    const before = await prisma.user.findUnique({
      where: { id: doctorId },
      include: { doctorProfile: { include: { subscriptions: true } } }
    });
    expect(before?.doctorProfile?.subscriptions.length ?? 0).toBe(0);

    const summary = await updateDoctorAiAccess(admin.id, doctorId, {
      aiEnabled: true,
      aiCreditsMonthly: 50
    });

    expect(summary.entitled).toBe(true);
    expect(summary.aiEnabled).toBe(true);
    expect(summary.monthlyCredits).toBe(50);

    // Se creo una suscripcion vigente para sostener el derecho.
    const after = await prisma.user.findUnique({
      where: { id: doctorId },
      include: { doctorProfile: { include: { subscriptions: true } } }
    });
    expect(after?.doctorProfile?.subscriptions.length).toBe(1);

    // Deja traza de auditoria.
    const audit = await prisma.auditLog.findFirst({
      where: { actorUserId: admin.id, action: "platform.doctor.ai_access_updated" },
      orderBy: { createdAt: "desc" }
    });
    expect(audit).toBeTruthy();
  });

  it("re-assigns credits and can disable AI without touching other capabilities", async () => {
    const adminEmail = uniqueEmail("aiaccess-admin");
    createdEmails.push(adminEmail);
    const admin = await createAdminUser(adminEmail);
    const doctorId = await registerDoctor("aiaccess-toggle");

    await updateDoctorAiAccess(admin.id, doctorId, { aiEnabled: true, aiCreditsMonthly: 100 });

    // Reasignar creditos (override por medico).
    const reassigned = await updateDoctorAiAccess(admin.id, doctorId, {
      aiEnabled: true,
      aiCreditsMonthly: 300
    });
    expect(reassigned.monthlyCredits).toBe(300);

    // Deshabilitar IA: aiEnabled false, sin quitar la suscripcion.
    const disabled = await updateDoctorAiAccess(admin.id, doctorId, { aiEnabled: false });
    expect(disabled.aiEnabled).toBe(false);
    expect(disabled.entitled).toBe(true);
  });

  it("rejects a non-admin actor", async () => {
    const notAdminId = await registerDoctor("aiaccess-notadmin");
    const doctorId = await registerDoctor("aiaccess-target");

    await expect(
      updateDoctorAiAccess(notAdminId, doctorId, { aiEnabled: true })
    ).rejects.toMatchObject({ status: 401 });
  });
});
