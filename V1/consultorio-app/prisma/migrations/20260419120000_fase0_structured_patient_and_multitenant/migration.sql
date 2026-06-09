-- CreateEnum
CREATE TYPE "PatientSex" AS ENUM ('MALE', 'FEMALE', 'INTERSEX');

-- CreateEnum
CREATE TYPE "PatientGender" AS ENUM ('NOT_SPECIFIED', 'MASCULINE', 'FEMININE', 'TRANSGENDER', 'TRANSSEXUAL', 'TRAVESTI', 'INTERSEX', 'OTHER');

-- CreateEnum
CREATE TYPE "PatientRelation" AS ENUM ('SELF', 'SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'FRIEND', 'CAREGIVER', 'OTHER');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "clinicId" TEXT,
ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "DoctorSubscription" ADD COLUMN     "features" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "clinicId" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "gender" "PatientGender",
ADD COLUMN     "lastNameMaternal" TEXT,
ADD COLUMN     "lastNamePaternal" TEXT,
ADD COLUMN     "sex" "PatientSex";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "clinicId" TEXT;

-- CreateTable
CREATE TABLE "PatientContact" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "relation" "PatientRelation" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastNamePaternal" TEXT NOT NULL,
    "lastNameMaternal" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientContact_patientId_idx" ON "PatientContact"("patientId");

-- CreateIndex
CREATE INDEX "PatientContact_patientId_isPrimary_idx" ON "PatientContact"("patientId", "isPrimary");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_idx" ON "Appointment"("clinicId");

-- CreateIndex
CREATE INDEX "Patient_clinicId_idx" ON "Patient"("clinicId");

-- CreateIndex
CREATE INDEX "User_clinicId_idx" ON "User"("clinicId");

-- AddForeignKey
ALTER TABLE "PatientContact" ADD CONSTRAINT "PatientContact_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "PatientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

