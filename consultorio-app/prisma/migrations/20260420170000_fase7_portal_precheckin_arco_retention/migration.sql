-- Fase 7: portal paciente v2, pre-check-in, consentimientos, ARCO y lifecycle de datos

CREATE TYPE "PatientDocumentCategory" AS ENUM ('STUDY', 'IDENTIFICATION', 'INSURANCE', 'OTHER');
CREATE TYPE "PatientDocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "DigitalConsentType" AS ENUM ('SENSITIVE_DATA_PROCESSING', 'PORTAL_USAGE', 'TELECONSULTATION');
CREATE TYPE "ConsentActorType" AS ENUM ('PATIENT', 'DOCTOR', 'SYSTEM');
CREATE TYPE "ArcoRequestType" AS ENUM ('ACCESS', 'RECTIFICATION', 'CANCELLATION', 'OPPOSITION');
CREATE TYPE "ArcoRequestStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');
CREATE TYPE "RetentionScope" AS ENUM ('GLOBAL', 'CLINIC');
CREATE TYPE "RetentionDataCategory" AS ENUM ('APPOINTMENTS', 'CLINICAL_NOTES', 'CONSENTS', 'AUDIT_LOGS', 'PATIENT_DOCUMENTS');
CREATE TYPE "DeletionMode" AS ENUM ('SOFT', 'HARD');

CREATE TABLE "PatientPreCheckin" (
  "id" TEXT PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "appointmentId" TEXT,
  "doctorId" TEXT NOT NULL,
  "attendanceConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "demographicsConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "pendingPaymentsAcknowledged" BOOLEAN NOT NULL DEFAULT false,
  "checklist" JSONB,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientPreCheckin_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PatientPreCheckin_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PatientPreCheckin_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PatientDocument" (
  "id" TEXT PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "appointmentId" TEXT,
  "doctorId" TEXT NOT NULL,
  "category" "PatientDocumentCategory" NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "status" "PatientDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PatientDocument_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PatientDocument_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DigitalConsent" (
  "id" TEXT PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "appointmentId" TEXT,
  "doctorId" TEXT NOT NULL,
  "consentType" "DigitalConsentType" NOT NULL,
  "version" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL,
  "actorType" "ConsentActorType" NOT NULL DEFAULT 'PATIENT',
  "source" "AuditSource" NOT NULL DEFAULT 'PATIENT_PORTAL',
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DigitalConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DigitalConsent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DigitalConsent_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ArcoRequest" (
  "id" TEXT PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "clinicId" TEXT,
  "requestedByUserId" TEXT,
  "resolvedByUserId" TEXT,
  "type" "ArcoRequestType" NOT NULL,
  "status" "ArcoRequestStatus" NOT NULL DEFAULT 'OPEN',
  "requestText" TEXT NOT NULL,
  "resolutionText" TEXT,
  "evidenceRef" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArcoRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ArcoRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ArcoRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ArcoRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DataRetentionPolicy" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT,
  "scope" "RetentionScope" NOT NULL DEFAULT 'GLOBAL',
  "dataCategory" "RetentionDataCategory" NOT NULL,
  "retentionDays" INTEGER NOT NULL,
  "hardDelete" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataRetentionPolicy_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DataDeletionLog" (
  "id" TEXT PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "appointmentId" TEXT,
  "performedByUserId" TEXT,
  "mode" "DeletionMode" NOT NULL,
  "reason" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataDeletionLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DataDeletionLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DataDeletionLog_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "PatientPreCheckin_patientId_createdAt_idx" ON "PatientPreCheckin"("patientId", "createdAt");
CREATE INDEX "PatientPreCheckin_appointmentId_createdAt_idx" ON "PatientPreCheckin"("appointmentId", "createdAt");
CREATE INDEX "PatientPreCheckin_doctorId_createdAt_idx" ON "PatientPreCheckin"("doctorId", "createdAt");

CREATE INDEX "PatientDocument_patientId_uploadedAt_idx" ON "PatientDocument"("patientId", "uploadedAt");
CREATE INDEX "PatientDocument_appointmentId_uploadedAt_idx" ON "PatientDocument"("appointmentId", "uploadedAt");
CREATE INDEX "PatientDocument_doctorId_uploadedAt_idx" ON "PatientDocument"("doctorId", "uploadedAt");

CREATE INDEX "DigitalConsent_patientId_consentType_acceptedAt_idx" ON "DigitalConsent"("patientId", "consentType", "acceptedAt");
CREATE INDEX "DigitalConsent_appointmentId_consentType_acceptedAt_idx" ON "DigitalConsent"("appointmentId", "consentType", "acceptedAt");

CREATE INDEX "ArcoRequest_patientId_status_requestedAt_idx" ON "ArcoRequest"("patientId", "status", "requestedAt");
CREATE INDEX "ArcoRequest_clinicId_status_requestedAt_idx" ON "ArcoRequest"("clinicId", "status", "requestedAt");

CREATE INDEX "DataRetentionPolicy_scope_dataCategory_active_idx" ON "DataRetentionPolicy"("scope", "dataCategory", "active");
CREATE INDEX "DataRetentionPolicy_clinicId_dataCategory_active_idx" ON "DataRetentionPolicy"("clinicId", "dataCategory", "active");

CREATE INDEX "DataDeletionLog_patientId_createdAt_idx" ON "DataDeletionLog"("patientId", "createdAt");
CREATE INDEX "DataDeletionLog_appointmentId_createdAt_idx" ON "DataDeletionLog"("appointmentId", "createdAt");