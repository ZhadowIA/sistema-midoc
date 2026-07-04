-- AlterTable
ALTER TABLE "PasswordResetToken"
ADD COLUMN "codeHash" TEXT,
ADD COLUMN "deliveryChannel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN "destination" TEXT;

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_codeHash_status_expiresAt_idx" ON "PasswordResetToken"("userId", "codeHash", "status", "expiresAt");
