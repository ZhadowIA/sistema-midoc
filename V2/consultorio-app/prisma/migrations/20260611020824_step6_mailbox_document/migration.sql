-- CreateEnum
CREATE TYPE "MailboxDocumentStatus" AS ENUM ('PENDING', 'PURGED');

-- AlterEnum
ALTER TYPE "SyncEventType" ADD VALUE 'DOCUMENT_UPLOADED';

-- CreateTable
CREATE TABLE "MailboxDocument" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "uploadLinkId" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "ciphertext" BYTEA,
    "sizeBytes" INTEGER NOT NULL,
    "status" "MailboxDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "MailboxDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailboxDocument_doctorId_status_idx" ON "MailboxDocument"("doctorId", "status");

-- AddForeignKey
ALTER TABLE "MailboxDocument" ADD CONSTRAINT "MailboxDocument_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxDocument" ADD CONSTRAINT "MailboxDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxDocument" ADD CONSTRAINT "MailboxDocument_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxDocument" ADD CONSTRAINT "MailboxDocument_uploadLinkId_fkey" FOREIGN KEY ("uploadLinkId") REFERENCES "DocumentUploadLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
