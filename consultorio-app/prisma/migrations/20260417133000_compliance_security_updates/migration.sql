DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'SECRETARY'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'SECRETARY';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditAction' AND e.enumlabel = 'CLINICAL_NOTE_UPDATED'
  ) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'CLINICAL_NOTE_UPDATED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditAction' AND e.enumlabel = 'AI_NOTE_GENERATION_REQUESTED'
  ) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'AI_NOTE_GENERATION_REQUESTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditAction' AND e.enumlabel = 'AI_NOTE_GENERATION_COMPLETED'
  ) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'AI_NOTE_GENERATION_COMPLETED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditAction' AND e.enumlabel = 'AI_NOTE_GENERATION_FAILED'
  ) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'AI_NOTE_GENERATION_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditAction' AND e.enumlabel = 'CONSENT_CAPTURED'
  ) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'CONSENT_CAPTURED';
  END IF;
END $$;

DO $$
BEGIN
  CREATE TYPE "ConsentType" AS ENUM ('BOOKING_PRIVACY_NOTICE', 'VERBAL_RECORDING_CONFIRMATION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AIJobKind" AS ENUM ('SOAP_NOTE_GENERATION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AIJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "bossId" TEXT;

ALTER TABLE "AppointmentAuditLog"
ADD COLUMN IF NOT EXISTS "ipAddress" TEXT,
ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

ALTER TABLE "ClinicalNote"
ADD COLUMN IF NOT EXISTS "soapPayload" JSONB;

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT,
  "appointmentId" TEXT,
  "patientId" TEXT,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConsentCapture" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "capturedByUserId" TEXT,
  "type" "ConsentType" NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConsentCapture_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AIProcessingJob" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "kind" "AIJobKind" NOT NULL,
  "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED',
  "progressPct" INTEGER NOT NULL DEFAULT 0,
  "statusMessage" TEXT,
  "resultPayload" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),

  CONSTRAINT "AIProcessingJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "User_bossId_idx" ON "User"("bossId");
CREATE INDEX IF NOT EXISTS "AuditLog_doctorId_createdAt_idx" ON "AuditLog"("doctorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_appointmentId_createdAt_idx" ON "AuditLog"("appointmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "ConsentCapture_appointmentId_type_createdAt_idx" ON "ConsentCapture"("appointmentId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "ConsentCapture_doctorId_createdAt_idx" ON "ConsentCapture"("doctorId", "createdAt");
CREATE INDEX IF NOT EXISTS "ConsentCapture_patientId_createdAt_idx" ON "ConsentCapture"("patientId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIProcessingJob_appointmentId_kind_createdAt_idx" ON "AIProcessingJob"("appointmentId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "AIProcessingJob_doctorId_createdAt_idx" ON "AIProcessingJob"("doctorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIProcessingJob_status_createdAt_idx" ON "AIProcessingJob"("status", "createdAt");

DO $$
BEGIN
  ALTER TABLE "User"
    ADD CONSTRAINT "User_bossId_fkey"
    FOREIGN KEY ("bossId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ConsentCapture"
    ADD CONSTRAINT "ConsentCapture_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ConsentCapture"
    ADD CONSTRAINT "ConsentCapture_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ConsentCapture"
    ADD CONSTRAINT "ConsentCapture_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ConsentCapture"
    ADD CONSTRAINT "ConsentCapture_capturedByUserId_fkey"
    FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AIProcessingJob"
    ADD CONSTRAINT "AIProcessingJob_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AIProcessingJob"
    ADD CONSTRAINT "AIProcessingJob_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
