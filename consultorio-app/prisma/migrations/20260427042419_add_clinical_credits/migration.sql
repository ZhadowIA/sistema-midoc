-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('MONTHLY_ALLOCATION', 'USAGE', 'PURCHASE', 'ADJUSTMENT', 'ROLLOVER');

-- CreateTable
CREATE TABLE "ClinicalCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalCreditTransaction" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalCredit_userId_key" ON "ClinicalCredit"("userId");

-- CreateIndex
CREATE INDEX "ClinicalCredit_userId_idx" ON "ClinicalCredit"("userId");

-- CreateIndex
CREATE INDEX "ClinicalCreditTransaction_creditId_createdAt_idx" ON "ClinicalCreditTransaction"("creditId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClinicalCredit" ADD CONSTRAINT "ClinicalCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalCreditTransaction" ADD CONSTRAINT "ClinicalCreditTransaction_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "ClinicalCredit"("id") ON DELETE CASCADE;
