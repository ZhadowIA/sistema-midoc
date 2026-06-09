-- Fase 6: lista de espera y reoferta automática de huecos

CREATE TYPE "WaitlistEntryStatus" AS ENUM ('ACTIVE', 'PAUSED', 'BOOKED', 'REMOVED');
CREATE TYPE "WaitlistOfferStatus" AS ENUM ('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WAITLIST_OFFER_SENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WAITLIST_OFFER_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WAITLIST_OFFER_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WAITLIST_OFFER_EXPIRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WAITLIST_SLOT_REASSIGNED';

CREATE TABLE "WaitlistEntry" (
  "id" TEXT PRIMARY KEY,
  "doctorId" TEXT NOT NULL,
  "clinicId" TEXT,
  "patientId" TEXT NOT NULL,
  "appointmentType" "AppointmentType",
  "preferredWeekdays" JSONB,
  "preferredStartMinute" INTEGER,
  "preferredEndMinute" INTEGER,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WaitlistEntry_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WaitlistEntry_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WaitlistEntry_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "WaitlistOffer" (
  "id" TEXT PRIMARY KEY,
  "waitlistEntryId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "clinicId" TEXT,
  "patientId" TEXT NOT NULL,
  "sourceAppointmentId" TEXT,
  "slotStartTime" TIMESTAMP(3) NOT NULL,
  "slotEndTime" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "WaitlistOfferStatus" NOT NULL DEFAULT 'SENT',
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "notifiedChannels" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WaitlistOffer_waitlistEntryId_fkey"
    FOREIGN KEY ("waitlistEntryId") REFERENCES "WaitlistEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WaitlistOffer_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WaitlistOffer_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WaitlistOffer_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WaitlistOffer_sourceAppointmentId_fkey"
    FOREIGN KEY ("sourceAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "WaitlistEntry_doctorId_status_priority_createdAt_idx"
  ON "WaitlistEntry"("doctorId", "status", "priority", "createdAt");
CREATE INDEX "WaitlistEntry_clinicId_status_priority_createdAt_idx"
  ON "WaitlistEntry"("clinicId", "status", "priority", "createdAt");
CREATE INDEX "WaitlistEntry_patientId_status_idx"
  ON "WaitlistEntry"("patientId", "status");

CREATE INDEX "WaitlistOffer_doctorId_status_expiresAt_idx"
  ON "WaitlistOffer"("doctorId", "status", "expiresAt");
CREATE INDEX "WaitlistOffer_waitlistEntryId_createdAt_idx"
  ON "WaitlistOffer"("waitlistEntryId", "createdAt");
CREATE INDEX "WaitlistOffer_patientId_status_createdAt_idx"
  ON "WaitlistOffer"("patientId", "status", "createdAt");
CREATE INDEX "WaitlistOffer_slotStartTime_slotEndTime_status_idx"
  ON "WaitlistOffer"("slotStartTime", "slotEndTime", "status");