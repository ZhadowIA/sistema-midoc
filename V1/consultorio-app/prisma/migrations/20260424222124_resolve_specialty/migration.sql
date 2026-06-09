/*
  Warnings:

  - You are about to drop the `AIInsightFeedback` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AIUsageEvent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AIInsightFeedback" DROP CONSTRAINT "AIInsightFeedback_aiInsightId_fkey";

-- DropForeignKey
ALTER TABLE "AIInsightFeedback" DROP CONSTRAINT "AIInsightFeedback_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "AIInsightFeedback" DROP CONSTRAINT "AIInsightFeedback_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "AIUsageEvent" DROP CONSTRAINT "AIUsageEvent_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "AIUsageEvent" DROP CONSTRAINT "AIUsageEvent_doctorId_fkey";

-- DropTable
DROP TABLE "AIInsightFeedback";

-- DropTable
DROP TABLE "AIUsageEvent";
