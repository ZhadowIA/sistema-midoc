-- CreateEnum
CREATE TYPE "AuthorizedSummaryStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'PURGED');

-- CreateTable
CREATE TABLE "AuthorizedSummary" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "token" TEXT NOT NULL,
    "ciphertext" BYTEA,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "title" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "status" "AuthorizedSummaryStatus" NOT NULL DEFAULT 'ACTIVE',
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "AuthorizedSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizedSummary_token_key" ON "AuthorizedSummary"("token");

-- CreateIndex
CREATE INDEX "AuthorizedSummary_doctorId_status_idx" ON "AuthorizedSummary"("doctorId", "status");

-- CreateIndex
CREATE INDEX "AuthorizedSummary_patientId_status_idx" ON "AuthorizedSummary"("patientId", "status");

-- AddForeignKey
ALTER TABLE "AuthorizedSummary" ADD CONSTRAINT "AuthorizedSummary_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizedSummary" ADD CONSTRAINT "AuthorizedSummary_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizedSummary" ADD CONSTRAINT "AuthorizedSummary_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
