# Roadmap de Fases — MiDoc

Documento vivo. Se actualiza con cada avance para permitir handoff entre agentes de IA.

**Convención de estados:** ✅ completada · 🟡 en progreso · ⬜ pendiente · ⏸ pausada · ❌ descartada

**Última actualización:** 2026-04-20
**Responsable humano:** spampa@outlook.com
**Target inicial:** médico solo con arquitectura lista para multi-doctor.

---

## Fase 0 — Fundaciones (schema, multi-tenant soft, contactos)

Preparar el esquema y datos para que todo lo que venga después no requiera migraciones dolorosas.

- ✅ **0.1 Schema estructurado + multi-tenant soft**
  - `User.clinicId`, `Patient.clinicId`, `Appointment.clinicId` (nullable, arquitectura sin UI todavía)
  - `DoctorSubscription.features Json @default("{}")`
  - `Patient.firstName / lastNamePaternal / lastNameMaternal / sex / gender`
  - Modelo `PatientContact` reutilizable con `isPrimary`, enum `PatientRelation`
  - `Appointment.contactId` FK → PatientContact (SetNull)
  - Enums `PatientSex` (HOMBRE/MUJER/INTERSEXUAL), `PatientGender` (NOT_SPECIFIED, MASCULINE, FEMININE, TRANSGENDER, TRANSSEXUAL, TRAVESTI, INTERSEX, OTHER)
  - Migración aplicada: `20260419120000_fase0_structured_patient_and_multitenant`
  - Commit: `50ecf0b`

- ✅ **0.2 Helpers de nombre + backfill**
  - `src/lib/patientName.ts` con `buildFullName` y `parseFullName` (heurística LATAM: últimos 2 tokens = apellidos)
  - 12 unit tests en `src/tests/unit/patientName.test.ts`
  - Script idempotente `prisma/backfill-patient-names.ts` (4 pacientes migrados, logs para casos ambiguos)
  - Actualización 2026-04-20: `Patient.fullName` eliminado en DB tras aplicar `20260419130000_drop_patient_fullname` con `prisma migrate reset` (entorno local de pruebas)
  - Commit: `86f091c`

- ✅ **0.3 featureFlags por suscripción**
  - ✅ `src/lib/featureFlags.ts` ahora lee `DoctorSubscription.features` JSON con cache por request
  - ✅ Helper `hasFeature(userId, flag)` disponible con flags tipados para clínica/IA/historia clínica
  - ✅ Cobertura unitaria agregada en `src/tests/unit/featureFlags.test.ts`

---

## Fase 1 — Reserva pública estructurada (API + UI + ripple)

Rediseñar el formulario público (`/agendar`) según la imagen de referencia del piloto: datos del paciente con apellidos separados, sección de acompañante y reCAPTCHA v3.

- ✅ **1.0 API pública: campos estructurados + contacto + reCAPTCHA v3**
  - `src/lib/publicApiContracts.ts` acepta `fullName` legacy O `firstName/lastNamePaternal/lastNameMaternal`; normaliza salida
  - `contactSchema` con `relation` (enum `PatientRelation`), nombres estructurados, phone, email opcional
  - `src/lib/env.ts`: `RECAPTCHA_V3_SECRET`, `RECAPTCHA_V3_MIN_SCORE` (default 0.5, validado 0–1)
  - `src/lib/recaptcha.ts`: verifica token contra Google siteverify, degrada a `disabled` si no hay secret
  - `src/services/AppointmentService.createPublicAppointment`: Patient create/update con campos estructurados, find-or-create de `PatientContact` por (patientId, relation, phone), setea `isPrimary` en el primer contacto, `Appointment.contactId`
  - Route handler `POST /api/public/appointments`: verifica reCAPTCHA con `expectedAction: 'booking'`, 400 missing-token / 403 otros fallos
  - Tests: 7 unit reCAPTCHA + 4 nuevos contratos (total 9/9 contract, 38/38 unit)
  - Commit: `77de354`

- ✅ **1.1 UI `/agendar` rediseñada**
  - Paso **info** reescrito con tres secciones: Datos del paciente / Datos del acompañante / Contacto del paciente
  - Selects `Sexo` y `Género` usan el componente Radix existente; opciones coinciden con enums Prisma
  - Botón **"Usar mismo nombre del paciente"** copia nombre estructurado al acompañante y deja `relation=SELF`
  - Script reCAPTCHA v3 cargado condicionalmente cuando `NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY` está presente; token generado con `grecaptcha.execute(..., { action: 'booking' })` dentro de `handleConfirm`
  - `applyPatientSession` usa `parseFullName` para pre-llenar los tres campos desde el `fullName` de sesión
  - Sessionstorage del bookingconfirm: `patientName` reconstruido con `buildFullName` implícito (join)
  - Env vars pendientes de documentar en `.env.example` (tiene cambios Deepgram no relacionados — hacerlo en commit aparte)

- ✅ **1.2 Ripple: mostrar nombre compuesto en todo el sistema**
  - ✅ `formatPatientName(patient)` consolidado con fallback legacy a `fullName` (solo compatibilidad)
  - ✅ Panel médico y portal paciente migrados a `formatPatientName` (agenda, detalle cita, receta, configuración, pacientes, workspace clínico, cuenta)
  - ✅ Dashboard, cuestionarios y notificaciones WhatsApp usan nombre estructurado (`formatPatientName`) en API/servicios
  - ✅ Test unitario adicional para fallback legacy + barrido `grep` en `src` (sin usos directos de `patient.fullName` en UI activa)
  - 🟡 Limpieza de contratos en progreso: `POST /api/admin/appointments` ya acepta `firstName/lastNamePaternal/lastNameMaternal` y mantiene fallback `fullName`
  - 🟡 Contratos auth paciente en progreso: `login/me` ya exponen `firstName/lastNamePaternal/lastNameMaternal` además de `fullName` (compatibilidad)
  - ✅ Alta manual en directorio (`/medico/pacientes`) migrada a payload estructurado: `firstName/lastNamePaternal/lastNameMaternal`
  - ✅ `/agendar` ahora prioriza nombre estructurado de sesión (`profile.firstName/lastNamePaternal/lastNameMaternal`) y usa `fullName` solo como fallback legacy
  - ✅ Alta de cita desde `/medico/agenda` ya envía `createPatient` estructurado (`firstName/lastNamePaternal/lastNameMaternal`) en lugar de depender solo de `fullName`
  - ✅ `POST /api/admin/patients` ahora prioriza contrato estructurado y deja `fullName` solo como fallback de compatibilidad
  - ✅ `POST /api/admin/appointments` ya no usa `legacyCreateManualAppointmentSchema`; contrato canónico único
  - ✅ Endpoints admin sin fallback legacy en entrada: `POST /api/admin/patients` y `POST /api/admin/appointments` ya requieren nombre estructurado
  - ✅ Limpieza de respuestas: `api/admin/patients`, `api/admin/appointments/[id]/consultation-context` y `api/auth/patient/history` ya no inyectan `fullName` derivado
  - ✅ `api/auth/patient/login` y `api/auth/patient/me` ya no envían `profile.fullName`; `/agendar` consume nombre estructurado de sesión
  - ✅ Limpieza de tipos UI: pantallas médicas/paciente y workspace clínico dejaron `fullName` como campo esperado en contratos internos
  - ✅ Contrato público actualizado: `publicApiContracts` ya requiere nombres estructurados; se elimina ingreso legacy por `fullName`
  - ✅ Cierre funcional completado para Fase 1.2 (fullName queda solo como utilitario interno en `patientName.ts` para compatibilidad puntual controlada)

---

## Fase 2 — Diferencial IA (en definición)

Capitalizar el stack IA ya armado (Deepgram + OpenAI + SOAP Zod) frente a competidores commodity. Detallar alcance una vez cerrada Fase 1.

- ✅ **2.1 Narración por IA — evolución del piloto** (base en `5220ac4`, hardening incremental cerrado)
  - ✅ 2.1.a Estabilización de cierre de grabación: `DictationPanel` ahora espera cierre de stream y no pierde el `interim` final antes de enviar a IA
  - ✅ 2.1.b Trazabilidad operativa: SSE de jobs ahora incluye `metrics.durationMs` y `metrics.failureCause`; auditoría de job guarda `durationMs` + tamaño de entrada (`audioBytes`/`transcriptChars`)
  - ✅ 2.1.c UX clínica: `DictationPanel` muestra “última nota generada”, “último fallo” y botón de reintento seguro sin regrabar
  - ✅ Criterio de cierre: flujo end-to-end de narración quedó estable, con trazabilidad operativa y capacidad de recuperación sin regrabar
- ✅ **2.2 Transcripción en vivo Deepgram + nota SOAP generada**
  - ✅ 2.2.a Trazabilidad de entrada de IA: `AIProcessingJob.resultPayload.meta` ahora guarda origen (`audio_upload`/`deepgram_stream`) y tamaño de entrada (`audioBytes`/`transcriptChars`) en éxito y fallo
  - ✅ 2.2.b Validación de calidad clínica de transcripción: `AINoteGenerationService` aplica umbrales mínimos (`chars`/`words`) y bloquea generación IA cuando la narración es insuficiente
  - ✅ 2.2.c Cobertura de pruebas: nueva suite unitaria `aiNoteGenerationService.test.ts` valida umbrales y normalización de transcript; integrada en `run-unit.ts`
- ✅ **2.3 AIInsight: diagnóstico/tratamiento sugerido visible y accionable**
  - ✅ 2.3.a Accionabilidad segura en UI: `AiInsightsPanel` ahora marca sugerencias ya aplicadas y bloquea doble inserción accidental en Assessment/Plan
  - ✅ 2.3.b Persistencia/telemetría de aplicación: nuevo endpoint `POST /api/clinical/admin/appointments/[id]/ai-insights/apply` registra evento en auditoría (`eventType=AI_INSIGHT_APPLIED`, kind, text)
  - ✅ 2.3.c Cobertura unitaria: `aiInsights.test.ts` valida normalización de clave, marcado aplicado y prevención de duplicados
- ✅ **2.4 Farmacovigilancia determinística — revisión del dedupe actual**
  - ✅ 2.4.a Dedupe de medicamento fortalecido: se normaliza principio activo (`buildMedicationDedupKey`) para detectar duplicidad aunque cambie dosis/presentación
  - ✅ 2.4.b Dedupe de alertas endurecido: comparación robusta por mensaje/recomendación normalizados (espacios/puntuación)
  - ✅ 2.4.c Reglas clínicas determinísticas adicionales: detección de triple combinación de riesgo renal (AINE + IECA/ARA-II + diurético) y riesgo serotoninérgico (tramadol + ISRS/SNRI)

---

## Fase 3 — Commodity UX (paridad competitiva)

Features que los competidores ya tienen y el piloto espera. Prioridad por fricción observada.

- ✅ **3.1 Expediente clínico unificado — consolidar `consulta` y `consulta-v2`**
  - ✅ 3.1.a Ruta canónica unificada: `/medico/citas/[id]/consulta` ahora renderiza directamente `ConsultationWorkspace`
  - ✅ 3.1.b Compatibilidad de enlaces legacy: `/consulta-v2` redirige permanentemente a `/consulta`
  - ✅ 3.1.c Limpieza final de flags/artefactos legacy: APIs de sesión/contexto ya no dependen de `CONSULTA_UNIFIED_*`; variables legacy removidas de `env` y `.env.example`
- ✅ **3.2 Historia clínica completa (ver `../plan_implementacion_historia_clinica_midoc.md`)**
  - ✅ 3.2.a Cobertura de campos clínicos ampliada en UI: `ClinicalHistoryForm` ahora incluye campos faltantes del formato oficial (AHF, APNP, AGO y andrológicos)
  - ✅ 3.2.b Legibilidad del versionado histórico: pantalla agrega resumen clínico estructurado (AHF/APNP/APP/alergias/meds/alertas/AGO/andrológico) para versión actual o seleccionada
  - ✅ 3.2.c Endpoints complementarios de consulta histórica por versión: `GET /api/admin/patients/[id]/clinical-history/versions/[versionId]`; listado principal entrega metadata y la UI carga payload histórico bajo demanda
  - ✅ Criterio de cierre: captura + lectura + consulta versionada completas sin brechas funcionales abiertas en esta fase
- ✅ **3.3 Recordatorios WhatsApp bidireccionales (confirmar/reagendar desde chat)**
  - ✅ 3.3.a Detección de intención de reagendar en webhook entrante (`/api/internal/whatsapp/incoming`)
  - ✅ 3.3.b Respuesta guiada para reagendar: el bot solicita nueva fecha/hora en formato `DD/MM/AAAA HH:mm` y mantiene trazabilidad en log inbound/outbound
  - ✅ 3.3.c Aplicación automática de reagenda: si el mensaje incluye fecha/hora válida, el bot valida traslapes/bloqueos, actualiza cita y audita `APPOINTMENT_RESCHEDULED`
- ✅ **3.4 Portal paciente: historial, próximas citas, descargas**
  - ✅ 3.4.a Descargas de consulta en portal paciente: nuevo `GET /api/auth/patient/appointments/[id]/download` genera TXT con resumen SOAP + receta
  - ✅ 3.4.b UI de historial con acción “Descargar resumen” para citas completadas
  - ✅ 3.4.c Refinamiento UX de descargas: historial local de descargas recientes + exportación PDF con branding básico en endpoint de descarga
- ✅ **3.5 Facturación/recibos básicos**
  - ✅ 3.5.a API de recibos básicos para médico: listado de consultas completadas con monto estimado (`/api/admin/billing/receipts`)
  - ✅ 3.5.b Descarga de recibo simple TXT por cita completada (`/api/admin/billing/receipts/[appointmentId]/download`)
  - ✅ 3.5.c UI de contabilidad con módulo “Recibos básicos” y botón de descarga por registro
  - ✅ 3.5.d Refinamiento fiscal: serie configurable, folio secuencial persistente por médico y datos fiscales emisor/receptor en API + TXT

---

## Fase 4 — Multi-doctor / Clínica

Activar el `clinicId` que ya quedó en schema y habilitar flujos multi-usuario.

- ✅ **4.1 Modelo `Clinic` + rol admin de clínica**
  - ✅ Nuevo modelo `Clinic` con owner opcional, `slug` único y relaciones a `User`, `Patient` y `Appointment`
  - ✅ Nuevo rol `CLINIC_ADMIN` en `UserRole` para separar administración de clínica del `ADMIN` global
  - ✅ Middleware/auth de área médica actualizado para permitir `CLINIC_ADMIN` con acceso equivalente de plataforma en esta fase base
  - ✅ Migración aplicada: `20260420044220_fase41_clinic_model_and_role`
- ✅ **4.2 UI de gestión multi-doctor (agenda compartida, permisos)**
  - ✅ 4.2.a Agenda compartida base: `CLINIC_ADMIN` ahora puede seleccionar médico de su clínica en `/medico/agenda` para visualizar día/semana con datos del doctor seleccionado
  - ✅ 4.2.b Permiso seguro inicial: al consultar agenda de otro médico, la UI entra en modo solo lectura para acciones de edición rápida (crear/bloquear/reagendar/cambiar estado)
  - ✅ 4.2.c Permisos granulares de edición cross-doctor (crear/editar por clínica) + auditoría de actor (metadata `actorRole` y `delegatedDoctorId`)
- ✅ **4.3 Suscripción a nivel clínica + seats**
  - ✅ 4.3.a Contexto de suscripción de clínica: `/api/admin/subscription` ahora resuelve `scope` (`DOCTOR`/`CLINIC`) y `billingDoctorId` para `CLINIC_ADMIN`
  - ✅ 4.3.b Telemetría de seats: endpoint devuelve `seats.included/used/available/overLimit` (basado en `DoctorSubscription.features.seats` + usuarios activos de clínica)
  - ✅ 4.3.c Enforcement de seats al alta/invitación de médicos: nuevo endpoint `POST /api/medico/clinic/doctors` valida límite y bloquea alta con `SEAT_LIMIT_REACHED` cuando la clínica supera seats incluidos
- ✅ **4.4 Reportes agregados por clínica**
  - ✅ Dashboard API (`/api/admin/dashboard/summary`) ahora incluye `clinicAggregates` para `CLINIC_ADMIN` con totales de clínica y desglose por médico activo
  - ✅ Dashboard UI (`/medico/dashboard`) muestra tarjeta de reporte agregado con métricas clínicas y breakdown por doctor

---

## Decisiones clave (D1–D6) registradas

- **D1:** migrar a campos estructurados; segundo apellido opcional
- **D2:** Sexo (Hombre/Mujer/Intersexual) y Género (8 opciones) como selects
- **D3:** `PatientContact` reutilizable (opción B)
- **D4:** reCAPTCHA v3 implementado ya (no diferir)
- **D5:** "Usar mismo nombre" copia datos y setea relación=`SELF`
- **D6:** Fase 0 antes que Fase 1.1; commits incrementales

## Notas operativas

- El entorno local usa Prisma con `--no-engine` (Accelerate-ready). Scripts que requieran conexión directa (p.ej. backfill) deben correr con `npx prisma generate` temporal, luego restaurar con `npm run db:generate:no-engine`.
- Los integration tests fallan en `setupTestDb.ts` por este mismo motivo (URL `prisma://`). No bloqueante para lógica pura — las pruebas de contrato pasan porque no tocan Prisma.
- Seed local: `tsx prisma/seed.ts` · credenciales admin: `admin@consultorio.com` / `admin123`.
