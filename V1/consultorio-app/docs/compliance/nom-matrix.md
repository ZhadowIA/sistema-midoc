# Matriz de cumplimiento NOM-004 / NOM-024

Entregable vivo (D13). Se actualiza con cada avance de producto. Cada requisito lleva estatus y referencia al módulo/modelo/endpoint que lo cubre.

**Leyenda de estatus:**
- `COMPLIANT` — implementado y verificable
- `PARTIAL` — parcialmente cubierto; pendiente descrito en columna "Brecha"
- `PENDING` — no implementado
- `NOT_APPLICABLE` — fuera de alcance del piloto

**Última revisión:** 2026-04-20

---

## NOM-004-SSA3-2012 — Expediente clínico

| # | Requisito (resumen) | Estatus | Cobertura técnica | Brecha |
|---|---|---|---|---|
| 4.1 | Integridad del expediente (datos generales, antecedentes, exploración, diagnóstico, plan) | `COMPLIANT` | `ClinicalHistory`, `ClinicalNote` (SOAP), `EncounterHistory`, `Prescription`, `AIInsight`; UI `ClinicalHistoryForm` con AHF/APNP/AGO/andrológicos (Fase 3.2.a) | — |
| 4.2 | Identificación del paciente: nombre completo, sexo, edad | `COMPLIANT` | `Patient.firstName/lastNamePaternal/lastNameMaternal/sex/gender/dateOfBirth` (Fase 0.1); `formatPatientName` unificado (Fase 1.2) | — |
| 4.3 | Identificación del médico tratante | `COMPLIANT` | `User` + `DoctorConfig` (cédula, especialidad); `ClinicalNote.signedByUserId` | — |
| 4.5 | Registros legibles, sin abreviaturas no convencionales | `PARTIAL` | Captura estructurada reduce ambigüedad; SOAP generado con validación Zod | No hay diccionario de abreviaturas aplicado automáticamente |
| 5.1 | Historia clínica (interrogatorio completo, exploración, diagnóstico, plan) | `COMPLIANT` | `ClinicalHistory` + `ClinicalHistoryVersion` (versionado histórico Fase 3.2.b) | — |
| 5.2 | Notas de evolución | `COMPLIANT` | `ClinicalNote` ligado a `Appointment`; `EncounterHistory` | — |
| 5.6 | Nota de interconsulta | `NOT_APPLICABLE` | No hay flujo de interconsulta en piloto | Fase futura |
| 5.7 | Nota de referencia/contrarreferencia | `NOT_APPLICABLE` | Igual que 5.6 | Fase futura |
| 6.1 | Receta médica: datos del médico, paciente, medicamento, dosis, presentación, vía | `COMPLIANT` | `Prescription` + `PrescriptionItem`; farmacovigilancia determinística (Fase 2.4) | — |
| 6.2 | Identificación del prescriptor (cédula) | `COMPLIANT` | `DoctorConfig.licenseNumber` usado en generación de receta | — |
| 7.x | Consentimiento informado | `PARTIAL` | `ConsentCapture` con IP/UA/metadata disponible | Falta flujo de captura obligatorio para procedimientos específicos — Fase 7.3 |
| 8.1 | Conservación mínima del expediente | `COMPLIANT` | Política de retención documentada: 5 años mínimo (NOM-004) en `docs/privacy/retention-policy.md` | Job de purga automática aún no implementado; retención conceptual hasta entonces |
| 8.2 | Propiedad del expediente y confidencialidad | `COMPLIANT` | Acceso scopeado por `doctorId` en todas las queries; auditoría en `AppointmentAuditLog`/`AuditLog` | — |

---

## NOM-024-SSA3-2012 — Sistemas de Información de Registro Electrónico para la Salud

| # | Requisito (resumen) | Estatus | Cobertura técnica | Brecha |
|---|---|---|---|---|
| 5.1 | Identificación única del paciente | `COMPLIANT` | `Patient.id` (cuid) único; multi-tenant soft con `ownerDoctorId`/`clinicId` (Fase 0.1) | — |
| 5.2 | Autenticación de usuarios | `COMPLIANT` | JWT HS256 en HttpOnly cookie `med_token`, 15 min + refresh + inactivity (Fase 10.1.a/b); rate limit en login (Fase 10.1.c) | — |
| 5.3 | Control de acceso por rol | `COMPLIANT` | `UserRole` (DOCTOR/SECRETARY/CLINIC_ADMIN/ADMIN/PATIENT); `getEffectiveDoctorId` enforcement en rutas admin | — |
| 5.4 | Bitácora de accesos y operaciones críticas | `COMPLIANT` | `AppointmentAuditLog` (actor/IP/UA/metadata) y `AuditLog` (sistema); eventos log-based en `observability.md` | — |
| 5.5 | Integridad y no repudio | `COMPLIANT` | `ClinicalNote.signedByUserId` + `signedAt`; `LegalAcceptance` con IP/UA append-only (Fase 5.5) | Firma electrónica avanzada (FIEL) no implementada — `NOT_APPLICABLE` en piloto |
| 6.1 | Interoperabilidad (HL7 / CIE-10) | `PARTIAL` | Campos estructurados listos para mapeo HL7 FHIR; sin exporter aún | Sin endpoint FHIR; Fase futura |
| 6.2 | Codificación diagnóstica CIE-10 | `PENDING` | `AIInsight` produce diagnóstico en texto libre | Catálogo CIE-10 + campo código pendiente |
| 7.1 | Confidencialidad en tránsito y reposo | `PARTIAL` | Cookies `secure` + `sameSite=strict` en prod; DATABASE_URL TLS requerido del proveedor | Cifrado en reposo depende del proveedor de DB (documentado en `data-subprocessors.md`) |
| 7.2 | Respaldo y continuidad | `COMPLIANT` | Política y runbook en `docs/ops/backup-restore.md` y `continuity-plan.md` (Fase 10.2); simulacro mensual obligatorio | — |
| 7.3 | Gestión de incidentes | `COMPLIANT` | `SecurityIncident` + playbook en `docs/security/incident-response.md` (Fase 10.7) | — |
| 7.4 | Retención y eliminación controlada | `COMPLIANT` | `docs/privacy/retention-policy.md` (Fase 10.5) | Job de purga automática pendiente |
| 7.5 | Registro de subencargados | `COMPLIANT` | `docs/privacy/data-subprocessors.md` (Fase 10.5) | DPAs firmados pendientes con cada proveedor |
| 8.x | Derechos ARCO | `PARTIAL` | Procedimiento manual documentado en `retention-policy.md`; export forense vía `/api/admin/audit/export` | UI de autoservicio del titular — Fase 7.4 |

---

## Brechas priorizadas

### Alto impacto (cerrar antes de declarar cumplimiento comercial fuerte)

1. **Consentimiento informado obligatorio en flujo** (Fase 7.3) — hoy `ConsentCapture` existe pero no se fuerza en puntos de captura.
2. **Codificación CIE-10** — catálogo local + campo en `ClinicalNote` / `AIInsight`.
3. **Job de purga automática con auditoría** — convertir la matriz de retención en jobs ejecutables.
4. **DPAs firmados** con DB, OpenAI, Deepgram.

### Medio

5. **Abreviaturas y plantillas por especialidad** (Fase 11.1) — reduce ambigüedad en notas.
6. **Interoperabilidad FHIR básica** — exporter `Patient`/`Observation`/`Encounter` para lectura de terceros autorizados.
7. **UI ARCO** (Fase 7.4).

### Bajo / futuro

8. **FIEL / firma electrónica avanzada** — requiere integración con SAT; tratable como `NOT_APPLICABLE` hasta que el piloto lo exija.
9. **Interconsulta y referencia** (NOM-004 5.6/5.7) — fase posterior.

## Gobernanza

- Revisar esta matriz al cerrar cada fase del roadmap. Actualizar estatus y brecha.
- Cualquier requisito marcado `COMPLIANT` debe tener evidencia verificable (ruta de código, migración o documento citado).
- Cualquier cambio a `PENDING` → `COMPLIANT` requiere actualizar también `docs/privacy/retention-policy.md` si toca retención y `docs/privacy/data-inventory.md` si toca dato nuevo.
