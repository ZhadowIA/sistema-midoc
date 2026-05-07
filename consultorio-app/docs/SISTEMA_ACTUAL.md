# Sistema MiDoc - Estado Actual del Sistema

Ultima actualizacion: 2026-04-15
Indice de documentacion: `docs/INDICE_DOCUMENTACION.md`

## 1) Resumen ejecutivo
MiDoc es una plataforma SaaS para consultorios medicos con:

- Agendado publico (invitado o paciente con cuenta).
- Panel medico (agenda, citas, expediente, pacientes, configuracion, contabilidad).
- Portal de paciente autenticado (historial y gestion de su cita).
- Suscripcion mensual con flujo de onboarding.
- Automatizaciones de WhatsApp (recordatorios, confirmaciones, bot entrante).
- Asistentes de IA clinica (transcripcion -> SOAP, insights clinicos y validacion de receta).

## 2) Stack tecnico
- Frontend/Backend: Next.js 16 App Router.
- Lenguaje: TypeScript.
- Base de datos: PostgreSQL + Prisma 6.
- Auth: JWT en cookie `med_token` HttpOnly.
- Validacion: Zod.
- Fechas: date-fns.
- IA: OpenAI (`OPENAI_API_KEY`).

## 3) Arquitectura funcional
- `src/app/api/public/*`: contratos publicos para disponibilidad, apartar modulo y crear cita.
- `src/app/api/auth/*`: login/registro medico y paciente, setup, suscripcion y onboarding.
- `src/app/api/admin/*`: operacion del medico (agenda, citas, SOAP, IA, pacientes, config, WhatsApp).
- `src/app/api/internal/*`: procesos internos (cron de notificaciones y webhook entrante de WhatsApp).
- `src/app/api/payments/*`: checkout (placeholder) y webhook con idempotencia.
- `src/services/*`: logica de dominio (Appointment, Availability, Notification, Questionnaire, Audit, WhatsApp logs).

## 4) Modelo de datos principal (Prisma)
Entidades clave actuales:

- `User`: medico/admin/paciente con perfil publico y campos de branding profesional (`professionalLicense`, `clinicAddress`, `logoImage`).
- `DoctorConfig`: duraciones, precios, reglas de WhatsApp y templates por medico.
- `DoctorSubscription` + `DoctorOnboarding` + `LegalAcceptance`: flujo SaaS de alta, cobro y activacion.
- `Patient`: expediente del directorio por medico (`ownerDoctorId`) y opcion de vinculo a `User` paciente (`userId`).
- `Appointment`: cita con `source` (`PATIENT`/`DOCTOR`), `status` y `durationMin`.
- `Questionnaire`: respuestas preconsulta JSON.
- `ClinicalNote` + `Prescription`: SOAP y receta.
- `AIInsight`: diagnosticos/tratamientos sugeridos y alimentos permitidos/prohibidos.
- `Notification`: cola de notificaciones (WhatsApp).
- `WhatsAppMessageLog`: auditoria de mensajes inbound/outbound.
- `AppointmentAuditLog`: trazabilidad de cambios criticos.

## 5) Flujo de acceso y setup (SaaS medico)
1. Registro medico: `POST /api/auth/register`
- Requiere: nombre/apellidos, correo, telefono, password y aceptacion legal.
- Crea `User`, `DoctorConfig`, `DoctorSubscription` (PENDING), `DoctorOnboarding` (incompleto) y `LegalAcceptance`.

2. Suscripcion: `POST /api/auth/subscribe`
- Activa la suscripcion y actualiza periodo.
- Devuelve `nextStep`.

3. Onboarding: `POST /api/auth/onboarding/complete`
- Marca onboarding completado.

4. Estado de setup: `GET /api/auth/setup-status`
- Responde `hasActiveSubscription`, `onboardingCompleted` y `nextStep` (`SUBSCRIPTION`, `ONBOARDING`, `DASHBOARD`).

## 6) Flujos de negocio actuales
### 6.1 Agendado publico
- Disponibilidad por dia: `GET /api/public/availability`.
- Disponibilidad por mes: `GET /api/public/availability/month`.
- Apartado temporal de modulo: `POST /api/public/availability/hold` (TTL 5 min).
- Liberar apartado: `DELETE /api/public/availability/hold`.
- Crear cita: `POST /api/public/appointments`.

Notas:
- Permite agendar como invitado o con cuenta paciente (`bookAsGuest`).
- Si agenda con cuenta y no invitado, vincula `userId` paciente.
- Se genera token de cuestionario y se encolan notificaciones de confirmacion + invitacion.

### 6.2 Citas desde panel medico
Endpoint: `POST /api/admin/appointments`

Permite dos modos:
- Asignar a paciente existente (`patientId`) del directorio del medico.
- Crear paciente nuevo en el mismo flujo (`createPatient`) y asignarlo.

Reglas:
- Evita duplicados por `ownerDoctorId + fullName + phone`.
- Valida traslapes contra citas y bloqueos.
- Citas creadas por medico quedan en `PENDING` (no se auto-confirman).

### 6.3 Directorio de pacientes y vinculacion de cuenta
- Listado/alta: `GET/POST /api/admin/patients`.
- Detalle y expediente: `GET/PATCH /api/admin/patients/[id]`.
- Vincular expediente con cuenta paciente existente: `POST /api/admin/patients/[id]/link-account`.
- Fusion de expedientes: `POST /api/admin/patients/merge` (sigue disponible para casos legacy).

### 6.4 Asignar cita a expediente y crear expediente desde cita
Endpoint: `PATCH /api/admin/appointments/[id]`

Acciones soportadas:
- `ASSIGN_PATIENT`: asigna una cita a un paciente existente del directorio.
- `CREATE_AND_ASSIGN_PATIENT`: crea expediente desde datos de la cita y lo asigna.
- `RESCHEDULE`: reagenda validando disponibilidad.
- Cambio directo de estatus permitido (`PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`).

Cada accion relevante se registra en `AppointmentAuditLog`.

### 6.5 Portal paciente autenticado
- Login paciente: `POST /api/auth/patient/login`.
- Perfil en sesion: `GET /api/auth/patient/me`.
- Historial: `GET /api/auth/patient/history`.
- Gestion de cita propia: `PATCH /api/auth/patient/appointments/[id]` con acciones:
  - `CONFIRM`
  - `CANCEL`
  - `RESCHEDULE`

### 6.6 Nota clinica y modulos IA
SOAP/receta:
- `GET/POST /api/admin/appointments/[id]/note`

IA:
- `POST /api/admin/appointments/[id]/note/generate`
  - Audio -> transcripcion -> SOAP.
  - Valida formato/tamano de audio y ownership.
- `GET/POST /api/admin/appointments/[id]/ai-insights`
  - Sugerencias de diagnosticos, tratamientos y plan alimenticio.
- `POST /api/admin/appointments/[id]/ai-validate`
  - Alertas de receta segun cuestionario/expediente y reglas deterministicas.

Robustez implementada en IA (`src/lib/aiNoteService.ts`):
- Validacion de entrada/salida con Zod.
- Sanitizacion de JSON de modelo.
- Timeout y reintentos con backoff para errores transitorios.
- Dedupe y reglas deterministicas de farmacovigilancia.

### 6.7 WhatsApp y notificaciones
Panel medico:
- Estado y reprocesado: `GET /api/admin/notifications/status`, `POST /api/admin/notifications/process`, `POST /api/admin/notifications/retry`.
- QR/logout proveedor: `GET /api/admin/whatsapp/qr/[doctorId]`, `DELETE /api/admin/whatsapp/logout/[doctorId]`.
- Historial de mensajes: `GET /api/admin/whatsapp/history`.
- Preview y envio de prueba de templates: `POST /api/admin/whatsapp/templates/preview`, `POST /api/admin/whatsapp/templates/test-send`.

Interno:
- Cron interno: `POST /api/internal/notifications/process` con header `x-notification-secret`.
- Webhook entrante bot: `POST /api/internal/whatsapp/incoming` con header `x-whatsapp-secret`.

Comportamiento:
- Recordatorios configurables por medico (horas y ventana).
- Templates personalizables por medico.
- Si cita `PENDING`, recordatorios piden confirmacion.
- Si cita `CONFIRMED`, recordatorio informa y ofrece cancelacion.
- Mensajes entrantes pueden confirmar/cancelar automaticamente (segun flags de config).

## 7) Endpoints clave (mapa rapido)
### Publicos
- `GET /api/public/doctors`
- `GET /api/public/availability`
- `GET /api/public/availability/month`
- `POST /api/public/availability/hold`
- `DELETE /api/public/availability/hold`
- `POST /api/public/appointments`
- `GET/POST /api/public/questionnaire/[token]`

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/register`
- `GET /api/auth/setup-status`
- `POST /api/auth/subscribe`
- `POST /api/auth/onboarding/complete`
- `POST /api/auth/patient/register`
- `POST /api/auth/patient/login`
- `GET /api/auth/patient/me`
- `GET /api/auth/patient/history`
- `PATCH /api/auth/patient/appointments/[id]`

### Admin medico
- Agenda: `GET /api/admin/agenda/day`, `GET /api/admin/agenda/week`
- Dashboard: `GET /api/agenda/admin/dashboard/summary`
- Disponibilidad: `GET/POST /api/admin/availability`, `PATCH/DELETE /api/admin/availability/[id]`, `GET /api/admin/availability/slots`
- Bloqueos: `POST /api/admin/blocks`, `POST /api/agenda/admin/schedule/generate`
- Citas: `POST /api/admin/appointments`, `GET/PATCH /api/admin/appointments/[id]`
- SOAP/IA: `GET/POST /api/admin/appointments/[id]/note`, `POST /api/admin/appointments/[id]/note/generate`, `GET/POST /api/admin/appointments/[id]/ai-insights`, `POST /api/admin/appointments/[id]/ai-validate`
- Pacientes: `GET/POST /api/admin/patients`, `GET/PATCH /api/admin/patients/[id]`, `POST /api/admin/patients/[id]/link-account`, `POST /api/admin/patients/merge`
- Config y perfil: `GET/PUT /api/admin/config`, `GET/PUT /api/admin/profile`
- Cuestionarios: `GET /api/admin/questionnaires`
- Notificaciones: `GET /api/admin/notifications/status`, `POST /api/admin/notifications/process`, `POST /api/admin/notifications/retry`
- WhatsApp: `GET /api/admin/whatsapp/history`, `GET /api/admin/whatsapp/qr/[doctorId]`, `DELETE /api/admin/whatsapp/logout/[doctorId]`, `POST /api/admin/whatsapp/templates/preview`, `POST /api/admin/whatsapp/templates/test-send`
- Suscripcion: `GET/PATCH /api/admin/subscription`

### Internos y pagos
- `POST /api/internal/notifications/process`
- `POST /api/internal/whatsapp/incoming`
- `POST /api/internal/payments/reconcile`
- `POST /api/payments/checkout`
- `POST /api/payments/webhook`

## 8) Variables de entorno vigentes
Requeridas:
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `APP_BASE_URL`
- `QUESTIONNAIRE_TOKEN_SECRET`

Integraciones:
- `WHATSAPP_API_URL`
- `WHATSAPP_WEBHOOK_SECRET`
- `NOTIFICATION_CRON_SECRET`
- `OPENAI_API_KEY`

Notificaciones:
- `NOTIFICATION_REMINDER_LEAD_MINUTES`
- `NOTIFICATION_REMINDER_LEAD_HOURS`
- `NOTIFICATION_REMINDER_WINDOW_MINUTES`
- `NOTIFICATION_MAX_RETRY_ATTEMPTS`
- `NOTIFICATION_RETRY_WINDOW_HOURS`
- `NOTIFICATION_PENDING_ESCALATION_MINUTES`
- `NOTIFICATION_PENDING_OVERDUE_MINUTES`
- `NOTIFICATION_PENDING_AUTO_CLOSE_HOURS`

Pagos:
- `PAYMENTS_PROVIDER` (`MOCK`, `STRIPE`, `CONEKTA`, `OPENPAY`)
- `PAYMENTS_WEBHOOK_SECRET`

Legales:
- `TERMS_VERSION`
- `PRIVACY_VERSION`

Ver referencia en `.env.example`.

## 9) Scripts operativos
- `npm run dev`
- `npm run dev:turbo`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run env:check`
- `npm run db:migrate:dev`
- `npm run db:migrate:deploy`
- `npm run db:migrate:status`
- `npm run db:generate:no-engine`
- `npm run test`
- `npm run test:unit`
- `npm run test:integration`

## 10) Notas de operacion y alcance actual
- El flujo de pagos sigue en modo operativo inicial (checkout placeholder + webhook preparado).
- El sistema soporta tanto pacientes invitados como pacientes con cuenta.
- El expediente medico del directorio y la informacion puntual de citas pueden coexistir y vincularse.
- Existe trazabilidad de eventos criticos de cita en auditoria.

