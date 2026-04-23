-- CreateEnum
CREATE TYPE "ClinicalEncounterSource" AS ENUM ('APPOINTMENT', 'STANDALONE', 'MIGRATION');

-- CreateEnum
CREATE TYPE "ClinicalEncounterStatus" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "EncounterHistory"
ADD COLUMN "clinicalEncounterId" TEXT;

-- CreateTable
CREATE TABLE "ClinicalEncounter" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicId" TEXT,
    "appointmentId" TEXT,
    "source" "ClinicalEncounterSource" NOT NULL DEFAULT 'STANDALONE',
    "status" "ClinicalEncounterStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicalEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EncounterHistory_clinicalEncounterId_key" ON "EncounterHistory"("clinicalEncounterId");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_doctorId_status_createdAt_idx" ON "ClinicalEncounter"("doctorId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_patientId_status_createdAt_idx" ON "ClinicalEncounter"("patientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_appointmentId_idx" ON "ClinicalEncounter"("appointmentId");

-- AddForeignKey
ALTER TABLE "EncounterHistory"
ADD CONSTRAINT "EncounterHistory_clinicalEncounterId_fkey"
FOREIGN KEY ("clinicalEncounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter"
ADD CONSTRAINT "ClinicalEncounter_doctorId_fkey"
FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter"
ADD CONSTRAINT "ClinicalEncounter_patientId_fkey"
FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter"
ADD CONSTRAINT "ClinicalEncounter_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
