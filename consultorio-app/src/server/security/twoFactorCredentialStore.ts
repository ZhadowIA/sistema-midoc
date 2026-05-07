import prisma from "@/lib/prisma";
import { randomUUID } from "node:crypto";

export type TwoFactorCredentialRecord = {
  userId: string;
  secretEncrypted: string | null;
  pendingSecretEncrypted: string | null;
  recoveryCodes: unknown;
  pendingGeneratedAt: Date | null;
  enabled: boolean;
  verifiedAt: Date | null;
};

function mapRow(row: TwoFactorCredentialRecord | undefined | null) {
  if (!row) return null;
  return row;
}

export async function getTwoFactorCredential(userId: string) {
  const rows = await prisma.$queryRaw<TwoFactorCredentialRecord[]>`
    SELECT
      "userId",
      "secretEncrypted",
      "pendingSecretEncrypted",
      "recoveryCodes",
      "pendingGeneratedAt",
      "enabled",
      "verifiedAt"
    FROM "TwoFactorCredential"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;
  return mapRow(rows[0]);
}

export async function upsertPendingTwoFactorSecret(userId: string, encryptedSecret: string) {
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "TwoFactorCredential" (
      "id",
      "userId",
      "enabled",
      "pendingSecretEncrypted",
      "pendingGeneratedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${userId},
      false,
      ${encryptedSecret},
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT ("userId")
    DO UPDATE SET
      "pendingSecretEncrypted" = EXCLUDED."pendingSecretEncrypted",
      "pendingGeneratedAt" = NOW(),
      "updatedAt" = NOW()
  `;
}

export async function enableTwoFactorFromPending(userId: string, pendingSecretEncrypted: string) {
  await prisma.$executeRaw`
    UPDATE "TwoFactorCredential"
    SET
      "secretEncrypted" = ${pendingSecretEncrypted},
      "pendingSecretEncrypted" = NULL,
      "pendingGeneratedAt" = NULL,
      "enabled" = true,
      "verifiedAt" = NOW(),
      "updatedAt" = NOW()
    WHERE "userId" = ${userId}
  `;
}

export async function updateRecoveryCodes(userId: string, recoveryCodes: string[]) {
  await prisma.$executeRaw`
    UPDATE "TwoFactorCredential"
    SET
      "recoveryCodes" = ${JSON.stringify(recoveryCodes)}::jsonb,
      "updatedAt" = NOW()
    WHERE "userId" = ${userId}
  `;
}

export async function disableTwoFactor(userId: string) {
  await prisma.$executeRaw`
    UPDATE "TwoFactorCredential"
    SET
      "enabled" = false,
      "secretEncrypted" = NULL,
      "pendingSecretEncrypted" = NULL,
      "pendingGeneratedAt" = NULL,
      "updatedAt" = NOW()
    WHERE "userId" = ${userId}
  `;
}
