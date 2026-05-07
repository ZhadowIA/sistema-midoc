-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppointmentStatus" ADD VALUE 'ARRIVED';
ALTER TYPE "AppointmentStatus" ADD VALUE 'WAITING';
ALTER TYPE "AppointmentStatus" ADD VALUE 'IN_CONSULTATION';
ALTER TYPE "AppointmentStatus" ADD VALUE 'CHECKOUT_PENDING';
ALTER TYPE "AppointmentStatus" ADD VALUE 'NO_SHOW';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_ARRIVED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_WAITING';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_IN_CONSULTATION';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_CHECKOUT_PENDING';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_NO_SHOW';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_CHECKOUT_COMPLETED';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "arrivedAt" TIMESTAMP(3);
