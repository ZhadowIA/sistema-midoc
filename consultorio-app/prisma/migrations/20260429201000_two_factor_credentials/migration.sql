CREATE TABLE "TwoFactorCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretEncrypted" TEXT,
    "pendingSecretEncrypted" TEXT,
    "pendingGeneratedAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TwoFactorCredential_userId_key" ON "TwoFactorCredential"("userId");

ALTER TABLE "TwoFactorCredential"
ADD CONSTRAINT "TwoFactorCredential_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
