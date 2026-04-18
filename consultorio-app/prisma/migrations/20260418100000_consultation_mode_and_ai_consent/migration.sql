-- CreateEnum
CREATE TYPE "ConsultationMode" AS ENUM ('MANUAL', 'AI_DICTATION', 'HYBRID');

-- CreateEnum
CREATE TYPE "AiConsentState" AS ENUM ('PENDING', 'GRANTED', 'DENIED');

-- AlterTable
ALTER TABLE "DoctorConfig"
ADD COLUMN "preferredConsultationMode" "ConsultationMode" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "EncounterHistory"
ADD COLUMN "consultationMode" "ConsultationMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "aiConsent" "AiConsentState" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "aiConsentDecidedAt" TIMESTAMP(3),
ADD COLUMN "aiConsentActorUserId" TEXT;
