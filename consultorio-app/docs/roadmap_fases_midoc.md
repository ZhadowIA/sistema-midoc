# Roadmap de Fases — MiDoc

Documento vivo. Se actualiza con cada avance para permitir handoff entre agentes de IA.

**Convención de estados:** ✅ completada · 🟡 en progreso · ⬜ pendiente · ⏸ pausada · ❌ descartada

**Última actualización:** 2026-04-19
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
  - `fullName` se mantiene como espejo auto-generado para no romper búsquedas/displays
  - Commit: `86f091c`

- ⬜ **0.3 featureFlags por suscripción**
  - `src/lib/featureFlags.ts` debe leer de `DoctorSubscription.features` JSON
  - Helper `hasFeature(userId, flag)` con cache por request
  - Por ahora pospuesto por acuerdo con el usuario (no bloquea Fase 1). Retomar antes de exponer features condicionales en UI.

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

- ⬜ **1.2 Ripple: mostrar nombre compuesto en todo el sistema**
  - Helper `formatPatientName(patient)` con fallback a `fullName`
  - Reemplazar usos de `patient.fullName` en: panel médico (listas, detalle cita), dashboard, WhatsApp templates, cuestionarios, notificaciones, exportes
  - Tests unitarios del helper + barrido con grep para garantizar cobertura

---

## Fase 2 — Diferencial IA (en definición)

Capitalizar el stack IA ya armado (Deepgram + OpenAI + SOAP Zod) frente a competidores commodity. Detallar alcance una vez cerrada Fase 1.

- ⬜ **2.1 Narración por IA — evolución del piloto** (ya existe `5220ac4 feat(consulta): narración por IA con guion de preguntas`; evaluar qué falta)
- ⬜ **2.2 Transcripción en vivo Deepgram + nota SOAP generada**
- ⬜ **2.3 AIInsight: diagnóstico/tratamiento sugerido visible y accionable**
- ⬜ **2.4 Farmacovigilancia determinística — revisión del dedupe actual**

---

## Fase 3 — Commodity UX (paridad competitiva)

Features que los competidores ya tienen y el piloto espera. Prioridad por fricción observada.

- ⬜ **3.1 Expediente clínico unificado — consolidar `consulta` y `consulta-v2`**
- ⬜ **3.2 Historia clínica completa (ver `plan_implementacion_historia_clinica_midoc.md`)**
- ⬜ **3.3 Recordatorios WhatsApp bidireccionales (confirmar/reagendar desde chat)**
- ⬜ **3.4 Portal paciente: historial, próximas citas, descargas**
- ⬜ **3.5 Facturación/recibos básicos**

---

## Fase 4 — Multi-doctor / Clínica

Activar el `clinicId` que ya quedó en schema y habilitar flujos multi-usuario.

- ⬜ **4.1 Modelo `Clinic` + rol admin de clínica**
- ⬜ **4.2 UI de gestión multi-doctor (agenda compartida, permisos)**
- ⬜ **4.3 Suscripción a nivel clínica + seats**
- ⬜ **4.4 Reportes agregados por clínica**

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
