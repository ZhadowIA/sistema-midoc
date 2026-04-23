-- CreateEnum
CREATE TYPE "AppointmentPaymentStatus" AS ENUM ('NOT_REQUIRED', 'PAYMENT_PENDING', 'DEPOSIT_PAID', 'PAYMENT_FAILED');

-- CreateEnum
CREATE TYPE "DepositRefundMode" AS ENUM ('FULL', 'PARTIAL', 'CREDIT', 'FORFEIT');

-- AlterTable
ALTER TABLE "DoctorConfig"
ADD COLUMN     "depositEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "depositAmount" DECIMAL(10,2),
ADD COLUMN     "depositExpiresInMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "cancellationWindowHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "cancellationRefundMode" "DepositRefundMode" NOT NULL DEFAULT 'FULL',
ADD COLUMN     "cancellationPartialRefundPct" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "Appointment"
ADD COLUMN     "paymentStatus" "AppointmentPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "depositRequiredAmount" DECIMAL(10,2),
ADD COLUMN     "depositPaidAmount" DECIMAL(10,2),
ADD COLUMN     "depositDueAt" TIMESTAMP(3),
ADD COLUMN     "depositPaidAt" TIMESTAMP(3),
ADD COLUMN     "cancellationPolicySnapshot" JSONB;
