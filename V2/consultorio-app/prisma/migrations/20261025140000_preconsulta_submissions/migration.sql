-- Preconsulta configurable (paso 32, rebanada 2): respuestas en transito.
-- Clase CLINICO en transito: solo el sobre sellado para la llave del medico;
-- el portal no puede abrirlo y lo borra (ciphertext null, purgedAt) al confirmar la app.

-- CreateTable
CREATE TABLE "PreconsultaSubmission" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "linkId" TEXT,
    "questionnaireVersion" INTEGER NOT NULL,
    "ciphertext" BYTEA,
    "sizeBytes" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "PreconsultaSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreconsultaSubmission_doctorId_purgedAt_idx" ON "PreconsultaSubmission"("doctorId", "purgedAt");

-- AddForeignKey
ALTER TABLE "PreconsultaSubmission" ADD CONSTRAINT "PreconsultaSubmission_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreconsultaSubmission" ADD CONSTRAINT "PreconsultaSubmission_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "PreconsultaLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

