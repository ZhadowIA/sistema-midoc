-- Fase 10.7: registro de incidentes de seguridad/privacidad

-- LegalAcceptance ya no es 1:1; la relación User.legalAcceptance pasa a listado.
-- (El schema conceptual ya lo refleja; esta migración agrega SecurityIncident y relaciones.)

CREATE TYPE "IncidentSeverity" AS ENUM ('P0', 'P1', 'P2', 'P3');
CREATE TYPE "IncidentCategory" AS ENUM (
  'SECURITY_BREACH',
  'DATA_LEAK',
  'UNAUTHORIZED_ACCESS',
  'SERVICE_OUTAGE',
  'DATA_INTEGRITY',
  'VENDOR_INCIDENT',
  'OTHER'
);
CREATE TYPE "IncidentStatus" AS ENUM (
  'OPEN',
  'INVESTIGATING',
  'CONTAINED',
  'RESOLVED',
  'POST_MORTEM',
  'CLOSED'
);

CREATE TABLE "SecurityIncident" (
  "id"                   TEXT PRIMARY KEY,
  "reportedByUserId"     TEXT NOT NULL,
  "assignedToUserId"     TEXT,
  "severity"             "IncidentSeverity" NOT NULL,
  "category"             "IncidentCategory" NOT NULL,
  "status"               "IncidentStatus" NOT NULL DEFAULT 'OPEN',
  "title"                TEXT NOT NULL,
  "summary"              TEXT NOT NULL,
  "detectedAt"           TIMESTAMP(3) NOT NULL,
  "containedAt"          TIMESTAMP(3),
  "resolvedAt"           TIMESTAMP(3),
  "affectedScope"        JSONB,
  "correctiveActions"    TEXT,
  "rootCause"            TEXT,
  "notificationRequired" BOOLEAN NOT NULL DEFAULT false,
  "notifiedAt"           TIMESTAMP(3),
  "evidenceExportRef"    TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityIncident_reportedByUserId_fkey"
    FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SecurityIncident_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SecurityIncident_status_detectedAt_idx" ON "SecurityIncident"("status", "detectedAt");
CREATE INDEX "SecurityIncident_severity_status_idx" ON "SecurityIncident"("severity", "status");
CREATE INDEX "SecurityIncident_reportedByUserId_createdAt_idx" ON "SecurityIncident"("reportedByUserId", "createdAt");
