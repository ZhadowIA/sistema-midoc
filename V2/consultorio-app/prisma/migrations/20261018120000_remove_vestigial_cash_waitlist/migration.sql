-- DropForeignKey
ALTER TABLE "WaitlistEntry" DROP CONSTRAINT "WaitlistEntry_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "WaitlistEntry" DROP CONSTRAINT "WaitlistEntry_patientId_fkey";

-- DropForeignKey
ALTER TABLE "WaitlistEntry" DROP CONSTRAINT "WaitlistEntry_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRecord" DROP CONSTRAINT "PaymentRecord_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRecord" DROP CONSTRAINT "PaymentRecord_patientId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRecord" DROP CONSTRAINT "PaymentRecord_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRecord" DROP CONSTRAINT "PaymentRecord_recordedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "CashDrawerSession" DROP CONSTRAINT "CashDrawerSession_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "CashDrawerSession" DROP CONSTRAINT "CashDrawerSession_closedByUserId_fkey";

-- DropTable
DROP TABLE "WaitlistEntry";

-- DropTable
DROP TABLE "PaymentRecord";

-- DropTable
DROP TABLE "CashDrawerSession";

-- DropEnum
DROP TYPE "WaitlistStatus";

-- DropEnum
DROP TYPE "PaymentStatus";

-- DropEnum
DROP TYPE "PaymentMethod";

-- DropEnum
DROP TYPE "CashDrawerStatus";

