-- Paso 29, rebanada 3: libro mayor de creditos de IA (abonos y consumos).
-- Clase OPERATIVO: sin contenido clinico.

-- CreateEnum
CREATE TYPE "AiCreditGrantKind" AS ENUM ('COURTESY', 'TOP_UP', 'PLAN_MONTHLY', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "AiCreditGrant" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "kind" "AiCreditGrantKind" NOT NULL,
    "credits" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCreditDebit" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "aiUsageLogId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCreditDebit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCreditGrant_doctorId_expiresAt_idx" ON "AiCreditGrant"("doctorId", "expiresAt");

-- CreateIndex
CREATE INDEX "AiCreditDebit_aiUsageLogId_idx" ON "AiCreditDebit"("aiUsageLogId");

-- CreateIndex
CREATE INDEX "AiCreditDebit_doctorId_idx" ON "AiCreditDebit"("doctorId");

-- AddForeignKey
ALTER TABLE "AiCreditGrant" ADD CONSTRAINT "AiCreditGrant_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCreditDebit" ADD CONSTRAINT "AiCreditDebit_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "AiCreditGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCreditDebit" ADD CONSTRAINT "AiCreditDebit_aiUsageLogId_fkey" FOREIGN KEY ("aiUsageLogId") REFERENCES "AiUsageLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

