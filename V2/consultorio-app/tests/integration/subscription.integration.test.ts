import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PlanStatus, PrismaClient, SubscriptionStatus } from "@prisma/client";

import { GET as notificationsGET } from "../../src/app/api/admin/notifications/route";
import { createDoctorAccount, createDoctorSubscription, signInDoctor } from "../../src/services/auth/auth-service";
import {
  cancelSubscription,
  changePlan,
  pauseSubscription,
  reactivateSubscription,
  resolveDoctorCapabilities
} from "../../src/services/subscription/subscription-service";

const prisma = new PrismaClient();

const RESTRICTED_PLAN_CODE = "AGENDA_ONLY";

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

function authedRequest(url: string, sessionToken: string) {
  return new Request(url, {
    headers: { cookie: `med_token=${sessionToken}` }
  });
}

async function registerDoctor(label: string) {
  const email = uniqueEmail(label);
  const account = await createDoctorAccount({
    email,
    password: "Str0ngPass!123",
    firstName: "Ana",
    lastName: "Ríos",
    professionalName: "Dra. Ana Ríos",
    licenseNumber: "1234567",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });

  return { email, userId: account.user.id };
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

  await prisma.authSession.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

const createdEmails: string[] = [];

beforeAll(async () => {
  await prisma.$connect();
  // Plan restringido para probar cambio de plan y gating: solo agenda.
  await prisma.subscriptionPlan.upsert({
    where: { code: RESTRICTED_PLAN_CODE },
    update: { status: PlanStatus.ACTIVE, capabilities: { agenda: true } },
    create: {
      code: RESTRICTED_PLAN_CODE,
      name: "Solo agenda",
      status: PlanStatus.ACTIVE,
      billingInterval: "monthly",
      priceCents: 0,
      currency: "MXN",
      capabilities: { agenda: true }
    }
  });
});

afterAll(async () => {
  for (const email of createdEmails) {
    await cleanupUserByEmail(email);
  }
  await prisma.$disconnect();
});

describe("subscription and capability gating (paso 12, rebanada 1)", () => {
  it("grants the plan capabilities only while the subscription is entitled", async () => {
    const { email, userId } = await registerDoctor("sub-lifecycle");
    createdEmails.push(email);

    // Sin suscripcion: todo gateado.
    const none = await resolveDoctorCapabilities(userId);
    expect(none.status).toBeNull();
    expect(none.entitled).toBe(false);
    expect(none.capabilities.notifications).toBe(false);

    await createDoctorSubscription({ doctorUserId: userId, planCode: "ESSENTIAL" });

    // TRIAL da derecho a todas las capacidades del plan por defecto.
    const trial = await resolveDoctorCapabilities(userId);
    expect(trial.status).toBe(SubscriptionStatus.TRIAL);
    expect(trial.entitled).toBe(true);
    expect(trial.capabilities.notifications).toBe(true);
    expect(trial.capabilities.ai).toBe(true);

    // Pausar quita el derecho sin perder la suscripcion.
    await pauseSubscription(userId);
    const paused = await resolveDoctorCapabilities(userId);
    expect(paused.status).toBe(SubscriptionStatus.PAUSED);
    expect(paused.entitled).toBe(false);
    expect(paused.capabilities.notifications).toBe(false);

    // Reactivar restablece el derecho.
    await reactivateSubscription(userId);
    const reactivated = await resolveDoctorCapabilities(userId);
    expect(reactivated.status).toBe(SubscriptionStatus.ACTIVE);
    expect(reactivated.entitled).toBe(true);
    expect(reactivated.capabilities.notifications).toBe(true);

    // Cancelar deja todo gateado.
    await cancelSubscription(userId);
    const cancelled = await resolveDoctorCapabilities(userId);
    expect(cancelled.status).toBe(SubscriptionStatus.CANCELLED);
    expect(cancelled.entitled).toBe(false);
    expect(cancelled.capabilities.agenda).toBe(false);
  });

  it("changes plan and narrows the effective capabilities", async () => {
    const { email, userId } = await registerDoctor("sub-changeplan");
    createdEmails.push(email);

    await createDoctorSubscription({ doctorUserId: userId, planCode: "ESSENTIAL" });
    expect((await resolveDoctorCapabilities(userId)).capabilities.notifications).toBe(true);

    await changePlan(userId, RESTRICTED_PLAN_CODE);
    const restricted = await resolveDoctorCapabilities(userId);
    expect(restricted.planCode).toBe(RESTRICTED_PLAN_CODE);
    expect(restricted.status).toBe(SubscriptionStatus.ACTIVE);
    expect(restricted.capabilities.agenda).toBe(true);
    expect(restricted.capabilities.notifications).toBe(false);
  });

  it("rejects changing to an unknown plan", async () => {
    const { email, userId } = await registerDoctor("sub-badplan");
    createdEmails.push(email);
    await createDoctorSubscription({ doctorUserId: userId, planCode: "ESSENTIAL" });

    await expect(changePlan(userId, "DOES_NOT_EXIST")).rejects.toMatchObject({ status: 404 });
  });

  it("gates a capability-protected route: 200 when entitled, 402 when not, 401 without session", async () => {
    const { email, userId } = await registerDoctor("sub-gating");
    createdEmails.push(email);

    const password = "Str0ngPass!123";
    const login = await signInDoctor({ email, password });
    if (login.requiresTwoFactor) {
      throw new Error("no se esperaba 2FA");
    }

    await createDoctorSubscription({ doctorUserId: userId, planCode: "ESSENTIAL" });

    const allowed = await notificationsGET(
      authedRequest("http://localhost/api/admin/notifications", login.sessionToken)
    );
    expect(allowed.status).toBe(200);

    // Cambiar a plan sin la capacidad de notificaciones.
    await changePlan(userId, RESTRICTED_PLAN_CODE);
    const blocked = await notificationsGET(
      authedRequest("http://localhost/api/admin/notifications", login.sessionToken)
    );
    expect(blocked.status).toBe(402);

    const anonymous = await notificationsGET(
      new Request("http://localhost/api/admin/notifications")
    );
    expect(anonymous.status).toBe(401);
  });
});
