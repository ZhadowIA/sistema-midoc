-- Retira el expediente clinico de la nube (residencia 1, REGLAS_DESARROLLO.md
-- secciones 2 y 4.1). Estas tablas venian del portal previo al giro local-first
-- (commit 0bc949e) y ninguna pantalla ni la app de escritorio las consumia ya.
-- El expediente autoritativo vive cifrado en la app del medico; la nube solo
-- conserva el buzon temporal (MailboxDocument) y los resumenes autorizados.
--
-- Tambien caen las FK colgantes `encounterId` de cuatro tablas vivas
-- (AiUsageLog, Consent, DocumentUploadLink, PrecheckinSubmission). En
-- AiUsageLog la columna ya se guardaba siempre nula: el reporte de uso de IA
-- que llega por sync descarta el id local del encuentro.
--
-- DESTRUCTIVA: contar filas en el entorno destino antes de aplicar. Si alguna
-- tabla trae datos reales de pacientes, detenerse y exportarlos a la app del
-- medico primero. En desarrollo local las 11 tablas estaban en 0 filas.

-- DropForeignKey
ALTER TABLE "AiUsageLog" DROP CONSTRAINT "AiUsageLog_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalDocument" DROP CONSTRAINT "ClinicalDocument_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalDocument" DROP CONSTRAINT "ClinicalDocument_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalDocument" DROP CONSTRAINT "ClinicalDocument_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalDocument" DROP CONSTRAINT "ClinicalDocument_patientId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalDocument" DROP CONSTRAINT "ClinicalDocument_uploadLinkId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalDocument" DROP CONSTRAINT "ClinicalDocument_uploadedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalNote" DROP CONSTRAINT "ClinicalNote_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalNote" DROP CONSTRAINT "ClinicalNote_signedByDoctorId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalNoteVersion" DROP CONSTRAINT "ClinicalNoteVersion_clinicalNoteId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalRecord" DROP CONSTRAINT "ClinicalRecord_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalRecord" DROP CONSTRAINT "ClinicalRecord_patientId_fkey";

-- DropForeignKey
ALTER TABLE "Consent" DROP CONSTRAINT "Consent_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "DentalChart" DROP CONSTRAINT "DentalChart_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "DentalChartEntry" DROP CONSTRAINT "DentalChartEntry_dentalChartId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentUploadLink" DROP CONSTRAINT "DocumentUploadLink_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_clinicalRecordId_fkey";

-- DropForeignKey
ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_patientId_fkey";

-- DropForeignKey
ALTER TABLE "PatientInstruction" DROP CONSTRAINT "PatientInstruction_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "PeriodontalChartEntry" DROP CONSTRAINT "PeriodontalChartEntry_dentalChartId_fkey";

-- DropForeignKey
ALTER TABLE "PrecheckinSubmission" DROP CONSTRAINT "PrecheckinSubmission_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "Prescription" DROP CONSTRAINT "Prescription_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "Prescription" DROP CONSTRAINT "Prescription_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "Prescription" DROP CONSTRAINT "Prescription_patientId_fkey";

-- DropForeignKey
ALTER TABLE "PrescriptionItem" DROP CONSTRAINT "PrescriptionItem_prescriptionId_fkey";

-- AlterTable
ALTER TABLE "AiUsageLog" DROP COLUMN "encounterId";

-- AlterTable
ALTER TABLE "Consent" DROP COLUMN "encounterId";

-- AlterTable
ALTER TABLE "DocumentUploadLink" DROP COLUMN "encounterId";

-- AlterTable
ALTER TABLE "PrecheckinSubmission" DROP COLUMN "encounterId";

-- DropTable
DROP TABLE "ClinicalDocument";

-- DropTable
DROP TABLE "ClinicalNote";

-- DropTable
DROP TABLE "ClinicalNoteVersion";

-- DropTable
DROP TABLE "ClinicalRecord";

-- DropTable
DROP TABLE "DentalChart";

-- DropTable
DROP TABLE "DentalChartEntry";

-- DropTable
DROP TABLE "Encounter";

-- DropTable
DROP TABLE "PatientInstruction";

-- DropTable
DROP TABLE "PeriodontalChartEntry";

-- DropTable
DROP TABLE "Prescription";

-- DropTable
DROP TABLE "PrescriptionItem";

-- DropEnum
DROP TYPE "ClinicalRecordStatus";

-- DropEnum
DROP TYPE "EncounterSource";

-- DropEnum
DROP TYPE "EncounterStatus";

-- DropEnum
DROP TYPE "InstructionStatus";

-- DropEnum
DROP TYPE "NoteStatus";

-- DropEnum
DROP TYPE "NoteType";

-- DropEnum
DROP TYPE "PrescriptionStatus";

-- DropEnum
DROP TYPE "UploadSource";

