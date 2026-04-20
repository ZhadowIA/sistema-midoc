-- DropIndex
DROP INDEX "ClinicalNote_signedByUserId_idx";

-- AlterTable
ALTER TABLE "DoctorConfig" ADD COLUMN     "issuerFiscalZipCode" TEXT,
ADD COLUMN     "issuerLegalName" TEXT,
ADD COLUMN     "issuerTaxId" TEXT,
ADD COLUMN     "issuerTaxRegime" TEXT,
ADD COLUMN     "receiptSeries" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "fiscalZipCode" TEXT,
ADD COLUMN     "taxId" TEXT;

-- CreateTable
CREATE TABLE "BillingReceipt" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "folioNumber" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingReceipt_appointmentId_key" ON "BillingReceipt"("appointmentId");

-- CreateIndex
CREATE INDEX "BillingReceipt_doctorId_issuedAt_idx" ON "BillingReceipt"("doctorId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingReceipt_doctorId_series_folioNumber_key" ON "BillingReceipt"("doctorId", "series", "folioNumber");

-- AddForeignKey
ALTER TABLE "BillingReceipt" ADD CONSTRAINT "BillingReceipt_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReceipt" ADD CONSTRAINT "BillingReceipt_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
