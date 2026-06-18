-- CreateEnum
CREATE TYPE "PhoneNotificationChannel" AS ENUM ('SMS', 'WHATSAPP');

-- AlterEnum
ALTER TYPE "ConsentType" ADD VALUE 'SMS_NOTIFICATIONS';
ALTER TYPE "ConsentType" ADD VALUE 'WHATSAPP_NOTIFICATIONS';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "preferredPhoneChannel" "PhoneNotificationChannel";
