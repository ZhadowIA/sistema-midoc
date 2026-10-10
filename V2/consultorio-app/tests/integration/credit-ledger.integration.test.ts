import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AiCreditGrantKind, AiProviderType, AiUsageType, LicenseSource, PrismaClient } from "@prisma/client";

import { GET as creditsRoute } from "../../src/app/api/sync/credits/route";
import { createDoctorAccount } from "../../src/services/auth/auth-service";
import {
  COURTESY_CREDITS,
  debitCredits,
  getCreditBalance,
  grantCredits,
  refundUsage
} from "../../src/services/ai/credit-ledger";
import { grantLicense } from "../../src/services/license/license-service";
import { linkSyncDevice } from "../../src/services/sync/sync-service";
import { approveDoctorAccountForTesting } from "../helpers/doctor-accounts";

const prisma = new PrismaClient();
const createdEmails: string[] = [];
const NOW = new Date("2026-10-07T12:00:00Z");

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
  return account.user.id;
}

async function usageLog(doctorId: string) {
  const provider =
    (await prisma.aiProvider.findFirst({ where: { name: "ledger-test", providerType: AiProviderType.TRANSCRIPTION } })) ??
    (await prisma.aiProvider.create({ data: { name: "ledger-test", providerType: AiProviderType.TRANSCRIPTION } }));
  return prisma.aiUsageLog.create({
    data: { doctorId, externalRunId: randomUUID(), providerId: provider.id, usageType: AiUsageType.TRANSCRIPTION }
  });
}

async function debit(doctorId: string, credits: number) {
  const log = await usageLog(doctorId);
  await prisma.$transaction((tx) => debitCredits(tx, { doctorUserId: doctorId, credits, aiUsageLogId: log.id, now: NOW }));
  return log.id;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  for (const email of createdEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    await prisma.aiUsageLog.deleteMany({ where: { doctorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
});

describe("AI credit ledger (paso 29 r3)", () => {
  it("spends expiring plan credits first and ignores expired ones", async () => {
    const doctorId = await createDoctor("ledger-order");
    await grantCredits({ doctorUserId: doctorId, kind: AiCreditGrantKind.TOP_UP, credits: 10, actorUserId: null });
    await grantCredits({
      doctorUserId: doctorId,
      kind: AiCreditGrantKind.PLAN_MONTHLY,
      credits: 4,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
      actorUserId: null
    });
    await grantCredits({
      doctorUserId: doctorId,
      kind: AiCreditGrantKind.PLAN_MONTHLY,
      credits: 50,
      expiresAt: new Date("2026-10-01T00:00:00Z"),
      actorUserId: null
    });

    const before = await getCreditBalance(doctorId, NOW);
    expect(before).toMatchObject({ balance: 14, expiringCredits: 4 });
    expect(before.nextExpiry?.toISOString()).toBe("2026-11-01T00:00:00.000Z");

    await debit(doctorId, 6);
    const grants = await prisma.aiCreditGrant.findMany({ where: { doctorId }, orderBy: { credits: "asc" } });
    expect(grants.map((g) => [g.kind, g.remaining])).toEqual([
      [AiCreditGrantKind.PLAN_MONTHLY, 0],
      [AiCreditGrantKind.TOP_UP, 8],
      [AiCreditGrantKind.PLAN_MONTHLY, 50]
    ]);
    expect((await getCreditBalance(doctorId, NOW)).balance).toBe(8);
  });

  it("refuses to overdraw and refunds exactly what a usage took", async () => {
    const doctorId = await createDoctor("ledger-refund");
    await grantCredits({ doctorUserId: doctorId, kind: AiCreditGrantKind.TOP_UP, credits: 3, actorUserId: null });
    await grantCredits({ doctorUserId: doctorId, kind: AiCreditGrantKind.ADJUSTMENT, credits: 2, actorUserId: null });

    await expect(debit(doctorId, 6)).rejects.toMatchObject({ status: 402 });
    expect((await getCreditBalance(doctorId, NOW)).balance).toBe(5);

    const usageId = await debit(doctorId, 4);
    expect((await getCreditBalance(doctorId, NOW)).balance).toBe(1);
    expect(await prisma.aiCreditDebit.count({ where: { aiUsageLogId: usageId } })).toBe(2);

    await prisma.$transaction((tx) => refundUsage(tx, usageId));
    await prisma.$transaction((tx) => refundUsage(tx, usageId));
    expect((await getCreditBalance(doctorId, NOW)).balance).toBe(5);
  });

  it("never spends more than the balance when many usages debit at once", async () => {
    const doctorId = await createDoctor("ledger-race");
    await grantCredits({ doctorUserId: doctorId, kind: AiCreditGrantKind.TOP_UP, credits: 3, actorUserId: null });
    const logs = await Promise.all(Array.from({ length: 10 }, () => usageLog(doctorId)));
    const attempts = await Promise.allSettled(
      logs.map((log) =>
        prisma.$transaction((tx) => debitCredits(tx, { doctorUserId: doctorId, credits: 1, aiUsageLogId: log.id, now: NOW }))
      )
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(3);
    const grant = await prisma.aiCreditGrant.findFirstOrThrow({ where: { doctorId } });
    expect(grant.remaining).toBe(0);
  });

  it("validates grants: only plan credits expire and accounts must be doctors", async () => {
    const doctorId = await createDoctor("ledger-validate");
    await expect(
      grantCredits({ doctorUserId: doctorId, kind: AiCreditGrantKind.TOP_UP, credits: 0, actorUserId: null })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      grantCredits({
        doctorUserId: doctorId,
        kind: AiCreditGrantKind.TOP_UP,
        credits: 5,
        expiresAt: new Date("2027-01-01"),
        actorUserId: null
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      grantCredits({ doctorUserId: doctorId, kind: AiCreditGrantKind.PLAN_MONTHLY, credits: 5, actorUserId: null })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      grantCredits({ doctorUserId: "no-existe", kind: AiCreditGrantKind.TOP_UP, credits: 5, actorUserId: null })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("includes courtesy credits with the license and shows the balance to the app", async () => {
    const doctorId = await createDoctor("ledger-courtesy");
    await grantLicense({ actorUserId: null, doctorUserId: doctorId, source: LicenseSource.PILOT });
    expect((await getCreditBalance(doctorId)).balance).toBe(COURTESY_CREDITS);

    const link = await linkSyncDevice(doctorId, "PC consultorio");
    const response = await creditsRoute(
      new Request("http://localhost/api/sync/credits", { headers: { authorization: `Bearer ${link.deviceToken}` } })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ balance: COURTESY_CREDITS, expiringCredits: 0, nextExpiry: null });

    const unauthorized = await creditsRoute(
      new Request("http://localhost/api/sync/credits", { headers: { authorization: "Bearer falso" } })
    );
    expect(unauthorized.status).toBe(401);
  });
});
