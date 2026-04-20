-- DropIndex
DROP INDEX IF EXISTS "Patient_ownerDoctorId_fullName_idx";

-- AlterTable: drop fullName mirror column and make structured fields required
ALTER TABLE "Patient" DROP COLUMN "fullName";
ALTER TABLE "Patient" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "Patient" ALTER COLUMN "lastNamePaternal" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Patient_ownerDoctorId_lastNamePaternal_firstName_idx" ON "Patient"("ownerDoctorId", "lastNamePaternal", "firstName");
