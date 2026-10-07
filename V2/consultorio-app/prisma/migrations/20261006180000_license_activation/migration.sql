-- Paso 29, rebanada 1: licencia de compra unica y activacion por equipo.
-- Clase OPERATIVO: sin contenido clinico.

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "LicenseSource" AS ENUM ('PURCHASE', 'GRANT', 'PILOT');

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "edition" TEXT NOT NULL DEFAULT 'STANDARD',
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "LicenseSource" NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "updatesUntil" TIMESTAMP(3) NOT NULL,
    "maxDevices" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseActivation" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "deviceName" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "LicenseActivation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "License_doctorId_key" ON "License"("doctorId");

-- CreateIndex
CREATE INDEX "LicenseActivation_licenseId_releasedAt_idx" ON "LicenseActivation"("licenseId", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseActivation_licenseId_installationId_key" ON "LicenseActivation"("licenseId", "installationId");

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseActivation" ADD CONSTRAINT "LicenseActivation_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;

