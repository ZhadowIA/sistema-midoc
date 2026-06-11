import {
  AuthorizedSummaryStatus,
  HoldStatus,
  MailboxDocumentStatus,
  NotificationStatus,
  PasswordResetStatus,
  UploadLinkStatus
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { prisma } from "../../lib/prisma";

const DEFAULT_MAILBOX_RETENTION_DAYS = 30;

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
};

function retentionCutoff(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * 24 * 3_600_000);
}

export async function runPilotCleanup(input: PilotCleanupInput = {}): Promise<PilotCleanupStats> {
  const now = input.now ?? new Date();
  const mailboxRetentionDays = Math.max(
    1,
    input.mailboxRetentionDays ?? DEFAULT_MAILBOX_RETENTION_DAYS
  );
  const mailboxCutoff = retentionCutoff(now, mailboxRetentionDays);

  const [
    expiredHolds,
    expiredPasswordResetTokens,
    expiredUploadLinks,
    cancelledExpiredLinkNotifications,
    purgedAuthorizedSummaries,
    purgedMailboxDocuments
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
    })
  ]);

  const stats = {
    expiredHolds: expiredHolds.count,
    expiredPasswordResetTokens: expiredPasswordResetTokens.count,
    expiredUploadLinks: expiredUploadLinks.count,
    cancelledExpiredLinkNotifications: cancelledExpiredLinkNotifications.count,
    purgedAuthorizedSummaries: purgedAuthorizedSummaries.count,
    purgedMailboxDocuments: purgedMailboxDocuments.count
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
