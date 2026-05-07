-- Appointment upload controls
ALTER TABLE "Appointment"
ADD COLUMN "uploadsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "uploadsEnabledAt" TIMESTAMP(3),
ADD COLUMN "uploadsExpiresAt" TIMESTAMP(3);

-- Upload source traceability
DO $$ BEGIN
  CREATE TYPE "PatientDocumentUploadSource" AS ENUM ('DOCTOR', 'PATIENT_ACCOUNT', 'EXTERNAL_LINK');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "PatientDocument"
ADD COLUMN "uploadSource" "PatientDocumentUploadSource" NOT NULL DEFAULT 'DOCTOR',
ADD COLUMN "uploadIp" TEXT,
ADD COLUMN "uploadUserAgent" TEXT;
