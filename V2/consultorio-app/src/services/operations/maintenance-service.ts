import {
  AuthorizedSummaryStatus,
  HoldStatus,
  MailboxDocumentStatus,
  NotificationStatus,
  PasswordResetStatus,
  Prisma,
  SyncEventType,
  UploadLinkStatus
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { MAILBOX_RETENTION_DAYS, mailboxRetentionCutoff } from "../../lib/mailbox-retention";
import { prisma } from "../../lib/prisma";

export type PilotCleanupInput = {
  now?: Date;
  mailboxRetentionDays?: number;
};

export type PilotCleanupStats = {
  expiredHolds: number;
  expiredPasswordResetTokens: number;
  expiredUploadLinks: number;
  cancelledExpiredLinkNotifications: number;
  purgedAuthorizedSummaries: number;
  purgedMailboxDocuments: number;
  purgedPrecheckins: number;
};

export async function runPilotCleanup(input: PilotCleanupInput = {}): Promise<PilotCleanupStats> {
  const now = input.now ?? new Date();
  const mailboxRetentionDays = Math.max(
    1,
    input.mailboxRetentionDays ?? MAILBOX_RETENTION_DAYS
  );
  const mailboxCutoff = mailboxRetentionCutoff(now, mailboxRetentionDays);

  // Preconsultas que la app nunca confirmo con ACK y ya excedieron su TTL
  // (13_contrato §2). Se resuelven antes de la transaccion para purgar tambien
  // el evento de sync que las referencia: el inbox seguira entregando el evento
  // (sin payload) y la app lo ignora sin romper, como tras un ACK.
  const expiredPrecheckins = await prisma.precheckinSubmission.findMany({
    where: {
      purgedAt: null,
      expiresAt: { lte: now }
    },
    select: { id: true }
  });
  const expiredPrecheckinIds = expiredPrecheckins.map((row) => row.id);
  const expiredPrecheckinEventFilter: Prisma.SyncEventWhereInput =
    expiredPrecheckinIds.length > 0
      ? {
          type: SyncEventType.PRECHECKIN_SUBMITTED,
          purgedAt: null,
          OR: expiredPrecheckinIds.map((id) => ({
            payload: { path: ["precheckinId"], equals: id }
          }))
        }
      : { id: { in: [] } };

  const [
    expiredHolds,
    expiredPasswordResetTokens,
    expiredUploadLinks,
    cancelledExpiredLinkNotifications,
    purgedAuthorizedSummaries,
    purgedMailboxDocuments,
    purgedPrecheckins
  ] = await prisma.$transaction([
    prisma.appointmentHold.updateMany({
      where: {
        status: HoldStatus.ACTIVE,
        expiresAt: { lte: now }
      },
      data: {
        status: HoldStatus.EXPIRED,
        releasedAt: now
      }
    }),
    prisma.passwordResetToken.updateMany({
      where: {
        status: PasswordResetStatus.ACTIVE,
        expiresAt: { lte: now }
      },
      data: {
        status: PasswordResetStatus.EXPIRED
      }
    }),
    prisma.documentUploadLink.updateMany({
      where: {
        status: UploadLinkStatus.ACTIVE,
        expiresAt: { lte: now }
      },
      data: {
        status: UploadLinkStatus.EXPIRED
      }
    }),
    prisma.notification.updateMany({
      where: {
        status: { in: [NotificationStatus.PENDING, NotificationStatus.RETRIED] },
        shortLink: {
          is: {
            expiresAt: { lte: now }
          }
        }
      },
      data: {
        status: NotificationStatus.CANCELLED,
        failedAt: now,
        lastError: "Action link expired before delivery."
      }
    }),
    prisma.authorizedSummary.updateMany({
      where: {
        status: AuthorizedSummaryStatus.ACTIVE,
        expiresAt: { lte: now }
      },
      data: {
        status: AuthorizedSummaryStatus.EXPIRED,
        ciphertext: null,
        purgedAt: now
      }
    }),
    prisma.mailboxDocument.updateMany({
      where: {
        status: MailboxDocumentStatus.PENDING,
        createdAt: { lte: mailboxCutoff }
      },
      data: {
        status: MailboxDocumentStatus.PURGED,
        ciphertext: null,
        purgedAt: now
      }
    }),
    // Purga por TTL: mismo resultado que el ACK (respuestas vacias, ciphertext
    // nulo, purgedAt), pero `deliveredAt` queda nulo: nunca llego a la app.
    prisma.precheckinSubmission.updateMany({
      where: { id: { in: expiredPrecheckinIds } },
      data: { responses: {}, ciphertext: null, purgedAt: now }
    }),
    prisma.syncEvent.updateMany({
      where: expiredPrecheckinEventFilter,
      data: { payload: Prisma.DbNull, purgedAt: now }
    })
  ]);

  const stats = {
    expiredHolds: expiredHolds.count,
    expiredPasswordResetTokens: expiredPasswordResetTokens.count,
    expiredUploadLinks: expiredUploadLinks.count,
    cancelledExpiredLinkNotifications: cancelledExpiredLinkNotifications.count,
    purgedAuthorizedSummaries: purgedAuthorizedSummaries.count,
    purgedMailboxDocuments: purgedMailboxDocuments.count,
    purgedPrecheckins: purgedPrecheckins.count
  };

  await writeAuditLog({
    entityType: "PilotMaintenance",
    entityId: now.toISOString(),
    action: "pilot.cleanup-ran",
    source: "maintenance-service",
    metadata: {
      ...stats,
      mailboxRetentionDays
    }
  });

  return stats;
}
