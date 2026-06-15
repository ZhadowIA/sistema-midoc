-- CreateEnum
CREATE TYPE "PrecheckinKind" AS ENUM ('GENERIC', 'MEDICAL_HISTORY');

-- AlterTable: antecedentes (MEDICAL_HISTORY) viajan sellados (sealed box X25519);
-- `responses` queda nulo y el contenido vive cifrado en `ciphertext`. La nube no
-- puede abrirlo; se entrega por sync y se purga tras ACK.
ALTER TABLE "PrecheckinSubmission"
  ADD COLUMN "kind" "PrecheckinKind" NOT NULL DEFAULT 'GENERIC',
  ADD COLUMN "ciphertext" BYTEA,
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "purgedAt" TIMESTAMP(3);
