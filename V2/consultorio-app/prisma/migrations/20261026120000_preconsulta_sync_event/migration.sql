-- Preconsulta configurable (paso 32, rebanada 3): aviso en el buzon de que hay
-- una preconsulta sellada por descargar. El evento solo lleva el id; el sobre
-- se baja aparte y se purga con el ACK, igual que los antecedentes sellados.

-- AlterEnum
ALTER TYPE "SyncEventType" ADD VALUE 'PRECONSULTA_SUBMITTED';
