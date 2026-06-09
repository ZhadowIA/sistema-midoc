-- AlterTable
ALTER TABLE "ClinicalNote"
ALTER COLUMN "appointmentId" DROP NOT NULL,
ADD COLUMN     "clinicalEncounterId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalNote_clinicalEncounterId_key" ON "ClinicalNote"("clinicalEncounterId");

-- AddForeignKey
ALTER TABLE "ClinicalNote"
ADD CONSTRAINT "ClinicalNote_clinicalEncounterId_fkey"
FOREIGN KEY ("clinicalEncounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
