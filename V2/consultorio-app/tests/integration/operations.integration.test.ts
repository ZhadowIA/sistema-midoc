import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AuthorizedSummaryStatus,
  HoldStatus,
  MailboxDocumentStatus,
  NotificationKind,
  NotificationStatus,
  PasswordResetStatus,
  PatientStatus,
  PrismaClient,
  UploadLinkStatus
} from "@prisma/client";

import { GET as healthGET } from "../../src/app/api/health/route";
import { GET as readinessGET } from "../../src/app/api/readiness/route";
import { getHealthStatus, getReadinessStatus } from "../../src/services/operations/health-service";
import { runPilotCleanup } from "../../src/services/operations/maintenance-service";

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

  await prisma.auditLog.deleteMany({ where: { doctorId: user.id } });
  await prisma.mailboxDocument.deleteMany({ where: { doctorId: user.id } });
  await prisma.authorizedSummary.deleteMany({ where: { doctorId: user.id } });
  await prisma.notification.deleteMany({ where: { doctorId: user.id } });
  await prisma.shortLink.deleteMany({ where: { doctorId: user.id } });
  await prisma.documentUploadLink.deleteMany({ where: { doctorId: user.id } });
  await prisma.appointmentHold.deleteMany({ where: { doctorId: user.id } });
  await prisma.patient.deleteMany({ where: { ownerDoctorId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("operations readiness (paso 9)", () => {
  it("reports liveness without touching clinical content", async () => {
    const status = await getHealthStatus();

    expect(status.status).toBe("ok");
    expect(status.service).toBe("consultorio-app");
    expect(status.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(status).toLowerCase()).not.toContain("patient");

    const response = await healthGET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  it("checks database readiness through a dedicated endpoint", async () => {
    const status = await getReadinessStatus();

    expect(status.status).toBe("ready");
    expect(status.checks.database).toBe("ok");

    const response = await readinessGET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      checks: { database: "ok" }
    });
  });
});

describe("pilot maintenance cleanup (paso 9)", () => {
  it("expires and purges stale operational data without logging clinical content", async () => {
    const email = uniqueEmail("doctor-pilot-cleanup");
    const now = new Date("2026-06-11T12:00:00.000Z");
    const expiredAt = new Date(now.getTime() - 60_000);
    const staleMailboxDate = new Date(now.getTime() - 31 * 24 * 3_600_000);

    try {
      const account = await prisma.user.create({
        data: {
          email,
          passwordHash: "test-hash",
          role: "DOCTOR",
          firstName: "Pilar",
          lastName: "Soto"
        }
      });

      const patient = await prisma.patient.create({
        data: {
          ownerDoctorId: account.id,
          firstName: "Tomas",
          lastName: "Paz",
          phone: "6140002222",
          status: PatientStatus.ACTIVE
        }
      });

      const hold = await prisma.appointmentHold.create({
        data: {
          doctorId: account.id,
          patientId: patient.id,
          token: `hold-${randomUUID()}`,
          status: HoldStatus.ACTIVE,
          slotStart: new Date(now.getTime() + 3_600_000),
          slotEnd: new Date(now.getTime() + 5_400_000),
          expiresAt: expiredAt
        }
      });

      const uploadLink = await prisma.documentUploadLink.create({
        data: {
          doctorId: account.id,
          patientId: patient.id,
          token: `upload-${randomUUID()}`,
          status: UploadLinkStatus.ACTIVE,
          expiresAt: expiredAt,
          maxUploads: 2
        }
      });

      const mailbox = await prisma.mailboxDocument.create({
        data: {
          doctorId: account.id,
          patientId: patient.id,
          uploadLinkId: uploadLink.id,
          ciphertext: new Uint8Array(randomBytes(80)),
          sizeBytes: 80,
          status: MailboxDocumentStatus.PENDING,
          createdAt: staleMailboxDate
        }
      });

      const summary = await prisma.authorizedSummary.create({
        data: {
          doctorId: account.id,
          patientId: patient.id,
          token: `summary-${randomUUID()}`,
          ciphertext: new Uint8Array(randomBytes(80)),
          sizeBytes: 80,
          status: AuthorizedSummaryStatus.ACTIVE,
          expiresAt: expiredAt
        }
      });

      const shortLink = await prisma.shortLink.create({
        data: {
          doctorId: account.id,
          patientId: patient.id,
          code: `p${randomUUID().replace(/-/g, "").slice(0, 7)}`,
          destinationUrl: "https://example.com/paciente",
          expiresAt: expiredAt
        }
      });

      const notification = await prisma.notification.create({
        data: {
          doctorId: account.id,
          patientId: patient.id,
          shortLinkId: shortLink.id,
          channel: "SMS",
          kind: NotificationKind.DOCUMENT_UPLOAD,
          destination: "6140002222",
          body: "Accion pendiente",
          status: NotificationStatus.PENDING
        }
      });

      await prisma.passwordResetToken.create({
        data: {
          userId: account.id,
          tokenHash: `reset-${randomUUID()}`,
          status: PasswordResetStatus.ACTIVE,
          expiresAt: expiredAt
        }
      });

      const stats = await runPilotCleanup({ now, mailboxRetentionDays: 30 });
      expect(stats).toEqual({
        expiredHolds: 1,
        expiredPasswordResetTokens: 1,
        expiredUploadLinks: 1,
        cancelledExpiredLinkNotifications: 1,
        purgedAuthorizedSummaries: 1,
        purgedMailboxDocuments: 1
      });

      await expect(prisma.appointmentHold.findUniqueOrThrow({ where: { id: hold.id } })).resolves.toMatchObject({
        status: HoldStatus.EXPIRED,
        releasedAt: now
      });
      await expect(prisma.documentUploadLink.findUniqueOrThrow({ where: { id: uploadLink.id } })).resolves.toMatchObject({
        status: UploadLinkStatus.EXPIRED
      });
      await expect(prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).resolves.toMatchObject({
        status: NotificationStatus.CANCELLED
      });

      const purgedSummary = await prisma.authorizedSummary.findUniqueOrThrow({ where: { id: summary.id } });
      expect(purgedSummary.status).toBe(AuthorizedSummaryStatus.EXPIRED);
      expect(purgedSummary.ciphertext).toBeNull();
      expect(purgedSummary.purgedAt).toEqual(now);

      const purgedMailbox = await prisma.mailboxDocument.findUniqueOrThrow({ where: { id: mailbox.id } });
      expect(purgedMailbox.status).toBe(MailboxDocumentStatus.PURGED);
      expect(purgedMailbox.ciphertext).toBeNull();
      expect(purgedMailbox.purgedAt).toEqual(now);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          entityType: "PilotMaintenance",
          action: "pilot.cleanup-ran"
        },
        orderBy: { createdAt: "desc" }
      });
      expect(JSON.stringify(audit.metadata)).toContain("purgedMailboxDocuments");
      expect(JSON.stringify(audit.metadata)).not.toContain("Tomas");
      expect(JSON.stringify(audit.metadata)).not.toContain("ciphertext");
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("protects the internal cleanup endpoint with the cron secret", async () => {
    process.env.NOTIFICATION_CRON_SECRET = "test-cleanup-secret";
    const { POST: cleanupPOST } = await import(
      "../../src/app/api/internal/maintenance/cleanup/route"
    );

    const rejected = await cleanupPOST(new Request("http://localhost/api/internal/maintenance/cleanup"));
    expect(rejected.status).toBe(401);

    const accepted = await cleanupPOST(
      new Request("http://localhost/api/internal/maintenance/cleanup", {
        method: "POST",
        headers: { authorization: "Bearer test-cleanup-secret" }
      })
    );

    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({ stats: expect.any(Object) });
  });
});
