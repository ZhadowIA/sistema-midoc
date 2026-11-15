-- Preconsulta configurable (paso 32, rebanada 1): definicion del cuestionario
-- y enlaces. Clase OPERATIVO: preguntas y tokens como hash, nunca respuestas.

-- CreateEnum
CREATE TYPE "PreconsultaLinkKind" AS ENUM ('GENERAL', 'PERSONAL');

-- CreateEnum
CREATE TYPE "PreconsultaLinkStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');

-- CreateTable
CREATE TABLE "PreconsultaQuestionnaire" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreconsultaQuestionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreconsultaLink" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "kind" "PreconsultaLinkKind" NOT NULL,
    "status" "PreconsultaLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "tokenHash" TEXT NOT NULL,
    "patientRef" TEXT,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PreconsultaLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreconsultaQuestionnaire_doctorId_key" ON "PreconsultaQuestionnaire"("doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "PreconsultaLink_tokenHash_key" ON "PreconsultaLink"("tokenHash");

-- CreateIndex
CREATE INDEX "PreconsultaLink_doctorId_kind_status_idx" ON "PreconsultaLink"("doctorId", "kind", "status");

-- AddForeignKey
ALTER TABLE "PreconsultaQuestionnaire" ADD CONSTRAINT "PreconsultaQuestionnaire_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreconsultaLink" ADD CONSTRAINT "PreconsultaLink_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

