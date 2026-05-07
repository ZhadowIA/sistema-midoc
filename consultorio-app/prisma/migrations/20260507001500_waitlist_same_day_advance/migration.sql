-- Enum para tipo de oferta de lista de espera
CREATE TYPE "WaitlistOfferType" AS ENUM ('WAITLIST', 'SAME_DAY_ADVANCE');

-- Cambios en WaitlistOffer:
--   1. offerType column (default WAITLIST para compatibilidad con registros existentes)
--   2. waitlistEntryId ahora nullable
--   3. existingAppointmentId para ofertas SAME_DAY_ADVANCE

ALTER TABLE "WaitlistOffer"
  ADD COLUMN "offerType"             "WaitlistOfferType" NOT NULL DEFAULT 'WAITLIST',
  ADD COLUMN "existingAppointmentId" TEXT;

-- FK para existingAppointmentId
ALTER TABLE "WaitlistOffer"
  ADD CONSTRAINT "WaitlistOffer_existingAppointmentId_fkey"
  FOREIGN KEY ("existingAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- waitlistEntryId era NOT NULL — ahora nullable (no hay DROP/ADD, solo cambiamos el constraint)
ALTER TABLE "WaitlistOffer" ALTER COLUMN "waitlistEntryId" DROP NOT NULL;

-- FK de waitlistEntryId: antes era CASCADE, ahora SET NULL (porque puede ser null)
ALTER TABLE "WaitlistOffer"
  DROP CONSTRAINT "WaitlistOffer_waitlistEntryId_fkey";

ALTER TABLE "WaitlistOffer"
  ADD CONSTRAINT "WaitlistOffer_waitlistEntryId_fkey"
  FOREIGN KEY ("waitlistEntryId") REFERENCES "WaitlistEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
