# Roadmap de Fases — MiDoc

Documento vivo. Se actualiza con cada avance para permitir handoff entre agentes de IA.

**Convención de estados:** ✅ completada · 🟡 en progreso · ⬜ pendiente · ⏸ pausada · ❌ descartada

**Última actualización:** 2026-04-25 (Fase 5 completa: monetización real, política anticipo, historial depósitos, autoservicio suscripción)
**Responsable humano:** spampa@outlook.com
**Target inicial:** médico solo con arquitectura lista para multi-doctor.

**Nota de consolidación (2026-04-23):** este roadmap ya contempla la reestructuración del cuestionario pre-clínico IA, su gating por add-on, la política de créditos clínicos por sesión y la estrategia especialidad-first con benchmark competitivo.

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
  - ✅ Dashboard API (`/api/agenda/admin/dashboard/summary`) ahora incluye `clinicAggregates` para `CLINIC_ADMIN` con totales de clínica y desglose por médico activo
  - ✅ Dashboard UI (`/medico/dashboard`) muestra tarjeta de reporte agregado con métricas clínicas y breakdown por doctor

---

---

## Fase 5 — Monetización real y control de no-show

Cerrar el bloque de cobro real para que MiDoc deje de operar en modo pruebas y pueda monetizar de forma estable, con reglas de anticipo, cancelación y evidencia contractual mínima.

- 🟡 **5.1 Pasarela real y suscripción productiva** — proveedor `STRIPE` implementado; pendiente validación E2E con cuenta Stripe live
  - ✅ Checkout real Stripe implementado en `POST /api/payments/checkout` (session de suscripción)
  - ✅ Webhook Stripe con validación de firma + idempotencia implementado en `POST /api/payments/webhook`
  - ✅ Cancelación al fin de periodo sincronizada con Stripe desde `PATCH /api/admin/subscription`
  - ⬜ Pendiente: validación E2E de alta/renovación/fallo/cancelación/reactivación contra cuenta Stripe real
  - Integrar proveedor real (`STRIPE`, `CONEKTA` u `OPENPAY`)
  - Reemplazar checkout placeholder por checkout real
  - Cubrir flujo completo:
    - alta de suscripción
    - renovación
    - fallo de cobro
    - cancelación
    - reactivación
  - Webhooks productivos con validación de firma e idempotencia

- ✅ **5.2 Anticipo por cita y política de no-show**
  - ✅ 5.2.a Ciclo de pago separado del ciclo clínico: `AppointmentPaymentStatus` enum extendido con `REFUND_PENDING`, `CREDIT_ISSUED`, `DEPOSIT_FORFEITED` (migración aplicada)
  - ✅ 5.2.b UI de configuración de política en `/medico/configuracion` tab “parámetros”: toggle anticipo, monto, tiempo para pagar, ventana sin penalización, modo de reembolso (total/parcial/crédito/forfeit), porcentaje parcial
  - ✅ 5.2.c Booking público calcula `depositRequiredAmount`, `depositDueAt` y snapshot de política en `cancellationPolicySnapshot` al crear la cita
  - ✅ 5.2.d Expiración automática: `POST /api/internal/payments/process` cancela citas vencidas con `PAYMENT_FAILED` + `AppointmentAuditService.safeLog` con `reason: DEPOSIT_EXPIRED` + libera hueco a waitlist
  - ✅ 5.2.e Cancelación con reembolso: `updateAppointmentStatus` calcula `resolveDepositCancellationOutcome` cuando `DEPOSIT_PAID`; actualiza `paymentStatus` → `REFUND_PENDING | CREDIT_ISSUED | DEPOSIT_FORFEITED`; devuelve `billingOutcome` en respuesta PATCH
  - ⬜ Gap productivo: `paymentIntentId` no persiste en `Appointment` — `stripe.refunds.create()` requiere el PI ID; resolver cuando Stripe live esté conectado

- ✅ **5.3 Historial de cobro y autoservicio**
  - ✅ `/medico/suscripcion`: historial de eventos de cobro (Stripe webhooks), método de pago (**** last4), monto, próxima renovación, grace period, botón cancelar/reactivar — implementado completamente
  - ✅ Portal paciente `/paciente/historial`: badge de estado de depósito por cita (`PAYMENT_PENDING` con vencimiento, `DEPOSIT_PAID`, `REFUND_PENDING`, `CREDIT_ISSUED`, `DEPOSIT_FORFEITED`, `PAYMENT_FAILED`)
  - ✅ Botón “Pagar anticipo” activo para citas con `paymentStatus=PAYMENT_PENDING` — redirige a Stripe Checkout vía `POST /api/payments/appointments/[id]/deposit/checkout`

- ⬜ **5.4 Minimización de riesgo PCI**
  - Usar tokenización / hosted checkout
  - No almacenar PAN/CVV en MiDoc
  - Documentar el flujo técnico de pago y su superficie de cumplimiento

- ✅ **5.5 Evidencia contractual mínima**
  - ✅ 5.5.a `LegalAcceptance` convertido en historial append-only: removido `@unique userId`, agregados `ipAddress`, `userAgent`, `context` y `@@index([userId, createdAt])` (migración `20260420120000_fase55_legal_acceptance_history`)
  - ✅ 5.5.b Helper `src/lib/legalAcceptance.ts` con `recordLegalAcceptance` (captura IP/UA desde `Request` vía `requestContext`) y `getLegalStatusForUser` (versiones vigentes vs. aceptadas, flag `upToDate`)
  - ✅ 5.5.c `POST /api/auth/register` ahora persiste IP/UA del alta con `context=REGISTER`
  - ✅ 5.5.d Endpoints nuevos: `GET /api/auth/legal/status` (verificación de versiones) y `POST /api/auth/legal/accept` (re-aceptación append con `context=REACCEPT` y evidencia IP/UA)

---

## Fase 6 — Lista de espera y llenado automático de huecos

Recuperar cancelaciones y convertir huecos muertos en citas reales, aprovechando la infraestructura actual de agenda, estados, auditoría y WhatsApp.

- ✅ **6.1 Lista de espera estructurada**
  - ✅ Modelos `WaitlistEntry` y `WaitlistOffer` con alcance por médico/clínica/paciente
  - ✅ Preferencias por día (`preferredWeekdays`), rango horario (`preferredStartMinute`/`preferredEndMinute`) y tipo de consulta (`appointmentType`)
  - ✅ Prioridad configurable (`priority`) con estado operativo (`ACTIVE/PAUSED/BOOKED/REMOVED`)
  - ✅ Endpoints admin: `GET/POST /api/admin/waitlist` y `PATCH /api/admin/waitlist/[id]`

- ✅ **6.2 Reoferta automática de slots**
  - ✅ Detección de huecos liberados por cancelación desde admin, portal paciente y WhatsApp bot
  - ✅ Oferta escalonada con `WaitlistService.processVacancy` y selección por prioridad + preferencias
  - ✅ TTL por oferta (`expiresAt`, 15 min) y endpoint operativo `POST /api/admin/waitlist/process` para expirar/promover
  - ✅ Escalamiento al siguiente paciente cuando la oferta se rechaza o expira

- ✅ **6.3 Confirmación y cobro de huecos**
  - ✅ Confirmación/rechazo rápido desde portal paciente (`POST /api/auth/patient/waitlist/offers/[id]`)
  - ✅ Bloqueo temporal del slot con `ScheduleBlock` tipo `PRIVATE_RESERVED` durante la oferta
  - 🟡 Regla opcional de anticipo marcada como dependencia de Fase 5.2 (cobro real)

- ✅ **6.4 Trazabilidad operativa**
  - ✅ Nuevas acciones de auditoría: `WAITLIST_OFFER_SENT`, `WAITLIST_OFFER_ACCEPTED`, `WAITLIST_OFFER_REJECTED`, `WAITLIST_OFFER_EXPIRED`, `WAITLIST_SLOT_REASSIGNED`
  - ✅ Auditoría completa de envío, aceptación, rechazo, expiración y reasignación final

---

## Fase 7 — Portal paciente v2 y pre-check-in

Reducir fricción antes de la consulta, reforzar la percepción de valor del producto y capturar evidencia operativa/legal útil desde el portal.

- ✅ **7.1 Portal paciente ampliado**
  - ✅ Historial y consultas enlazan flujo de pre-check-in
  - ✅ Centro de pagos pendientes en API/UI de historial (`billing.pendingCount/pendingTotal`)
  - ✅ Descargables existentes conservados en portal y resumidos en historial
  - ✅ Resumen previo visible para médico en detalle de cita (pre-check-in + documentos recientes)

- ✅ **7.2 Carga documental y pre-check-in**
  - ✅ Modelo `PatientDocument` + endpoint `GET/POST /api/auth/patient/documents`
  - ✅ Modelo `PatientPreCheckin` + endpoint `GET/POST /api/auth/patient/precheckin`
  - ✅ Pantalla portal `/paciente/pre-checkin` con checklist (asistencia, demográficos, pagos)
  - ✅ Consulta médica de resumen previo: `GET /api/admin/patients/[id]/precheckin-summary` y espejo `/api/clinical/...`

- ✅ **7.3 Consentimientos digitales básicos**
  - ✅ Modelo `DigitalConsent` con `consentType`, `version`, `acceptedAt`, `actorType`, `source`
  - ✅ Endpoint `GET/POST /api/auth/patient/consents`
  - ✅ Registro de IP/UA en aceptación desde portal paciente

- ✅ **7.4 ARCO básico**
  - ✅ Modelo `ArcoRequest` con tipos ACCESS/RECTIFICATION/CANCELLATION/OPPOSITION y estatus OPEN/IN_REVIEW/RESOLVED/REJECTED
  - ✅ Endpoint paciente `GET/POST /api/auth/patient/arco`
  - ✅ Endpoint administrativo `PATCH /api/admin/arco/[id]` para estatus/evidencia/resolución

- ✅ **7.5 Retención y eliminación**
  - ✅ Modelo `DataRetentionPolicy` + endpoint `GET/POST /api/admin/retention-policies`
  - ✅ Modelo `DataDeletionLog`
  - ✅ Endpoint `POST /api/admin/patients/[id]/deletion` con `mode=SOFT|HARD` y bitácora

---

## Fase 8 — Captación omnicanal y analítica de conversión

Hacer que MiDoc ayude a conseguir más citas, no solo a administrarlas, midiendo mejor conversión y manteniendo claims comerciales alineados al alcance real del producto.

- ⬜ **8.1 Omnicanal**
  - Widget embebible para sitio web
  - Links específicos para:
    - Instagram
    - WhatsApp
    - Google Business
    - campañas
  - Landing pública por médico/clínica optimizada para conversión

- ⬜ **8.2 Funnel y recuperación**
  - Tracking de fuente de adquisición
  - Embudo:
    - visita
    - inicio de reserva
    - reserva confirmada
    - cita completada
  - Recuperación de agendado abandonado

- ⬜ **8.3 Métricas comerciales**
  - Conversión por canal
  - Ocupación por fuente
  - Recuperación de abandono
  - Relación canal → pago → cita completada

- ⬜ **8.4 Claims comerciales controlados**
  - Documento interno de claims permitidos/prohibidos
  - Posicionar IA como:
    - copiloto clínico
    - apoyo documental
  - Evitar promesas de diagnóstico autónomo mientras no exista estrategia regulatoria formal

---

## Fase 9 — Teleconsulta y seguimiento postconsulta

Abrir un segundo modo de atención y aumentar seguimiento, con consentimiento específico, cobro previo y trazabilidad de eventos clave.

- ⬜ **9.1 Cita virtual**
  - Tipo de cita virtual
  - Enlace automático de videollamada
  - Instrucciones previas

- ⬜ **9.2 Consentimiento específico de teleconsulta**
  - Consentimiento versionado por cita
  - Registro de aceptación con metadata
  - Vínculo con la cita/consulta

- ⬜ **9.3 Pago previo para consulta virtual**
  - Reutilizar anticipo o cobro completo previo
  - Confirmación automática según pago

- ⬜ **9.4 Postconsulta y seguimiento**
  - Entrega postconsulta de resumen/indicaciones
  - Seguimiento automatizado a:
    - 24 h
    - 72 h
    - 7 días
  - Registro de respuesta/evolución

- ⬜ **9.5 Trazabilidad de eventos**
  - Conexión
  - inasistencia
  - reprogramación
  - aceptación de resumen/indicaciones

---

## Fase 10 — Seguridad, continuidad y cumplimiento pre-go-live

Cerrar los pendientes P0 que separan un MVP avanzado de un SaaS comercializable y confiable.

- 🟡 **10.1 Hardening de plataforma**
  - ✅ 10.1.a Cookies seguras: `med_token` ya es `httpOnly` + `secure` en prod + `sameSite=strict` + `path=/` + `maxAge=15min` (`src/lib/session.ts`, `src/lib/sessionConfig.ts`)
  - ✅ 10.1.b Expiración/control de sesión: cookie 15 min + `SESSION_REFRESH_INTERVAL_MS` 4 min + `INACTIVITY_TIMEOUT_MS` 15 min + `/api/auth/session/refresh` ya operativos
  - ✅ 10.1.c Hardening de login: rate limit IP+email (5 intentos / 15 min) en `/api/auth/login` y `/api/auth/patient/login`; logs estructurados `auth.login.failed` / `auth.login.rate_limited` para detección de brute-force
  - ✅ 10.1.d Runbook de rotación de secretos: inventario, procedimiento estándar y playbook de compromiso en `docs/security/secret-rotation.md`
  - ⏸ 10.1.e Recuperación de cuenta — **PAUSADA por falta de proveedor de email definido**. Requiere decidir canal (Resend / SendGrid / Postmark / AWS SES), dominio emisor y plantillas antes de implementar password reset con token de un solo uso, expiración corta y auditoría. Reactivar cuando se defina proveedor.

- ✅ **10.2 Base de datos y continuidad**
  - ✅ 10.2.a Playbook de migraciones staging/producción: `docs/ops/migrations-playbook.md` (flujo dev→staging→prod con `migrate deploy`, reglas destructivas, patrón expand/contract y checklist pre-deploy)
  - ✅ 10.2.b Runbook de backup/restore: `docs/ops/backup-restore.md` (política diaria + simulacro mensual, `pg_dump` custom, RTO < 60 min, RPO < 24 h, playbook de pérdida de datos)
  - ✅ 10.2.c Índices para carga real: `Appointment` ahora tiene `(doctorId, date)`, `(doctorId, startTime)`, `(patientId, date)`, `(status, date)`; `Notification` tiene `(status, createdAt)` y `(appointmentId)` — migración `20260420130000_fase102_hot_path_indexes` (cierra full-scan en agenda del médico y cola de notificaciones)
  - ✅ 10.2.d Plan de continuidad operativa: `docs/ops/continuity-plan.md` con matriz de degradación graceful (OpenAI/Deepgram/WhatsApp/reCAPTCHA/Stripe/DB), RPO/RTO y simulacros

- ✅ **10.3 Observabilidad**
  - ✅ 10.3.a Health checks: `GET /api/health` (liveness) y `GET /api/health/ready` (readiness con ping SQL y reporte `dbLatencyMs`; 503 cuando DB no responde)
  - ✅ 10.3.b Queue-health: nuevo `GET /api/internal/ops/queue-health` (auth `x-notification-secret`) reporta `pending`, `failed`, `oldestPendingAgeMin` y `PaymentWebhookEvent` con error; emite `ops.queue_health.*` con severidad warn/critical según umbrales
  - ✅ 10.3.c Alertas log-based documentadas: `docs/ops/observability.md` con tabla de eventos (auth abuse, integraciones, infra), umbrales y polling recomendado
  - ✅ 10.3.d Cobertura de rutas críticas: 5xx ya pasan por `captureError` en auth/notifications; umbrales de alerta definidos en observability.md

- 🟡 **10.4 QA go-live**
  - ✅ 10.4.a Smoke tests post-deploy: `scripts/smoke-tests.mjs` (sin deps, fetch nativo) valida `/api/health`, `/api/health/ready`, login + `setup-status` + logout; exit code 0/1 para integración en pipeline; variables `SMOKE_BASE_URL/EMAIL/PASSWORD/TIMEOUT_MS`. Script npm `npm run smoke`. Documentación en `docs/ops/smoke-tests.md`
  - ✅ 10.4.b Suite E2E mínima de flujos críticos: Playwright + Chromium con 4 specs (auth/dashboard, directorio de pacientes, agenda/citas, nota SOAP). Helpers reutilizables de auth y seed data. Scripts: `test:e2e`, `test:e2e:ui`, `test:e2e:headed`. Tests resilientes con skip automático si no hay datos de seed.
  - ⬜ 10.4.c Regresión de pagos y notificaciones — se habilita al cerrar Fase 5.1 (Stripe real)

- ✅ **10.5 Privacidad y lifecycle de datos**
  - ✅ 10.5.a Inventario de datos tratados: `docs/privacy/data-inventory.md` con categorías, campos sensibles, base legal y lista de campos con IP/UA
  - ✅ 10.5.b Política de retención y eliminación: `docs/privacy/retention-policy.md` (matriz por modelo, plazos, soft vs hard delete, protocolo ARCO provisional hasta Fase 7.4)
  - ✅ 10.5.c Registro de terceros/subencargados: `docs/privacy/data-subprocessors.md` (DB, Accelerate, OpenAI, Deepgram, reCAPTCHA, WhatsApp, Stripe/email pendientes) con checklist DPA
  - ✅ 10.5.d Evidencia exportable de auditoría: nuevo `GET /api/admin/audit/export?from&to` (ventana máx 180 días) devuelve `AppointmentAuditLog` + `AuditLog` + `LegalAcceptance` + `ConsentCapture` del médico; emite `privacy.audit.export` para trazabilidad del acceso

- ✅ **10.6 Matriz de cumplimiento NOM**
  - ✅ 10.6.a Matriz NOM-004 punto por punto (12 requisitos): integridad, identificación, receta, consentimiento, conservación; referencia a `ClinicalHistory`, `ClinicalNote`, `Prescription`, `ConsentCapture` y políticas de retención
  - ✅ 10.6.b Matriz NOM-024 punto por punto (13 requisitos): autenticación, bitácora, integridad/no-repudio, interoperabilidad, confidencialidad, respaldo, incidentes, retención, subencargados, ARCO
  - ✅ 10.6.c Brechas priorizadas documentadas (consentimiento obligatorio, CIE-10, job de purga, DPAs firmados, FHIR, UI ARCO, FIEL) con owner implícito por fase
  - ✅ 10.6.d `docs/compliance/nom-matrix.md` marcado como entregable vivo con regla de actualización al cerrar cada fase

- ✅ **10.7 Incidentes y evidencia**
  - ✅ 10.7.a Modelo `SecurityIncident` con enums `IncidentSeverity` (P0–P3), `IncidentCategory` (7 tipos) y `IncidentStatus` (6 estados); campos de timeline, alcance, acciones correctivas, notificación y `evidenceExportRef`; migración `20260420140000_fase107_security_incidents`
  - ✅ 10.7.b Endpoints: `GET/POST /api/admin/security/incidents` (listado y alta con log `security.incident.opened`) y `GET/PATCH /api/admin/security/incidents/[id]` (detalle y actualización controlada por reporter/asignado)
  - ✅ 10.7.c Fix relacional: `User.legalAcceptances` ahora es 1:N tras 5.5 (antes `LegalAcceptance?` 1:1, inconsistente con el historial append-only)
  - ✅ 10.7.d Playbook completo: `docs/security/incident-response.md` con severidades/tiempos, flujo OPEN→CLOSED, criterios de notificación obligatoria, métricas (MTTD/MTTC) y cruce con export forense de 10.5

---

## Fase 11 — Copiloto clínico útil y gobernado

Pasar de “IA que genera cosas” a IA que ahorra tiempo clínico real, con trazabilidad, métricas y límites de uso claros.

- ✅ **11.1 Productividad clínica** *(2026-04-26)*
  - ✅ Plantillas por especialidad — `specialtyTemplates.ts` con templates para las 8 especialidades, aplicado automáticamente en `ConsultationWorkspace` según `doctor.specialty`
  - ✅ Resumen longitudinal entre consultas — `GET /api/clinical/admin/encounters/[id]/longitudinal-summary` + `LongitudinalSummaryPanel` en workspace
  - ✅ Indicaciones para paciente en lenguaje simple — `generatePatientInstructions` (IA) + `POST /api/clinical/admin/encounters/[id]/patient-instructions` + `PatientInstructionsPanel` en workspace (copiable al portapapeles)
  - ⬜ Seguimiento automatizado inteligente por WhatsApp *(diferido a Fase 12 — requiere flujo post-firma con lógica de notificación)*

- ✅ **11.2 Detección de huecos clínicos** *(implementado antes de 2026-04-26)*
  - ✅ Alergias faltantes — regla determinística en `deterministicGapAnalysis`
  - ✅ Datos incompletos — 6 reglas: sangre, antecedentes patológicos/familiares, medicamentos, vitales, exploración física
  - ✅ Contradicciones — `llmGapAnalysis` con `category: "contradiction"` vía GPT-4o
  - ✅ Alertas de revisión clínica — `llmGapAnalysis` con `category: "red-flag"` + deduplicación híbrida

- ✅ **11.3 Gobernanza IA** *(2026-04-25)*
  - ✅ Trazabilidad de prompts/modelos/versiones (`AIUsageEvent` con `promptVersion`, `model`, `provider`)
  - ✅ Métricas de uso y costo por módulo IA — página `/medico/ia-gobernanza` + API `GET /api/admin/ai/usage/summary`
  - ✅ Registro de aceptación/rechazo de sugerencias — `AIInsightFeedback` + API `GET /api/admin/ai/insights/feedback/summary`
  - ✅ Trazabilidad por cita — `GET /api/admin/ai/trace?appointmentId=`

- ✅ **11.4 Límites regulatorios visibles** *(2026-04-26)*
  - ✅ Disclaimers en módulos IA — `AiClinicalDisclaimer` en `DictationPanel`, `AiInsightsPanel` y `PatientInstructionsPanel`
  - ✅ Diferenciar “sugerencia” vs “decisión médica” — disclaimer explicita “NO emite diagnóstico autónomo; la decisión final y firma son responsabilidad del profesional”
  - ✅ Consentimiento para funciones IA — `AiConsentModal` con registro de trazabilidad por cita (`AiConsentState` en `EncounterHistory`)
  - ⬜ Dictamen externo de postura comercial/regulatoria *(tarea de negocio/legal — fuera de scope de ingeniería)*

- ✅ **11.5 Cuestionario pre-clínico IA conversacional (texto)** *(2026-04-26)*
  - ✅ Flujo conversacional con primera pregunta fija + hasta 4 preguntas adicionales generadas por IA
  - ✅ Historial de preguntas/respuestas enviado en cada turno para evitar repetición y aumentar especificidad
  - ✅ Terminación inteligente: motivos rutinarios/procedimentales (revisión de brackets, chequeo, seguimiento) terminan en 1 turno sin preguntar más; motivos con síntomas activos profundizan con hasta 3 preguntas adicionales
  - ✅ Barra de progreso dinámica — muestra “Pregunta X de máx. 4”, no fija en 5 pasos
  - ✅ Salida para médico: conversación completa + resumen + posibles padecimientos orientativos + checklist de exploración física (omitidos para motivos rutinarios)
  - ✅ Gating comercial: requiere `ai.questionnaire.text` en features del doctor
  - ✅ Telemetría: `AI_QUESTIONNAIRE_INTERVIEW` registrado con tokens y duración

- ✅ **11.6 Cuestionario pre-clínico IA por voz con silencio inteligente**
  - ✅ `VoiceAiInterviewer` component: VAD por RMS con `AnalyserNode`, auto-corte a 1.8s de silencio post-habla, hard cap de 60s
  - ✅ Phases: `idle → requesting → listening → processing → speaking → done`; barra de progreso de silencio en tiempo real
  - ✅ `MediaRecorder` con `audio/webm;codecs=opus`, envía `FormData` a `/api/clinical/public/questionnaire/[token]/ai-interview`
  - ✅ Integrado en `cuestionario/[token]/page.tsx` con botón “ENTREVISTA IA (VOZ)” independiente del botón de texto
  - ✅ Feature gate: solo disponible con `ai.questionnaire.audio`; ruta diferencia audio vs texto para aplicar gate correcto
  - ✅ Telemetría: mismo endpoint `AI_QUESTIONNAIRE_INTERVIEW`, path de audio usa `transcribeAudio()` antes de `generateQuestionnaireFollowUp()`

- ✅ **11.7 Playbooks clínicos por especialidad (Top 8 v1)**
  - ✅ `specialtyTemplates.ts`: 8 especialidades con secciones SOAP estructuradas (reviewOfSystems, physicalExam, diagnosticPlan, treatmentPlan)
  - ✅ `specialtyPayloadSchemas.ts`: Zod schemas + tipos + payloads vacíos para las 8 especialidades
  - ✅ Módulos UI integrados en `ConsultationWorkspace` como `SectionAccordion` condicional por especialidad:
    - ✅ Medicina familiar (`FamilyMedicineSection`): factores de riesgo, preventivo, revisión por sistemas
    - ✅ Pediatría (`PediatricsSection`): curvas de crecimiento, vacunación, hitos de desarrollo, alertas pediátricas
    - ✅ Gineco/Ob (`GynecologySection`): fórmula obstétrica, FUM/FPP, control prenatal, tamizajes
    - ✅ Dermatología (`DermatologySection`): `LesionMapCanvas` interactivo con topografía y morfología
    - ✅ Cardiología (`CardiologySection`): factores CV, Framingham/ASCVD, escalas NYHA/CCS
    - ✅ Salud mental (`MentalHealthSection`): PHQ-9/GAD-7, evaluación de riesgo, plan terapéutico
    - ✅ Odontología (`DentalSpecialtySection`): odontograma interactivo, periodontograma, plan de tratamiento
    - ✅ Oftalmología (`OphthalmologySection`): agudeza visual OD/OI, refracción, PIO, segmentos
  - ✅ Disponible para todos los planes (sin requisito de IA)

- ✅ **11.8 IA especializada por especialidad (solo planes IA)**
  - ✅ `generateDictationFromTranscriptWithTelemetry`: acepta `specialty` en `clinicalContext`; inyecta hint en system prompt para adaptar terminología, secciones ROS y plan a la especialidad
  - ✅ `generateComprehensiveInsightsWithTelemetry`: acepta `specialty`; ajusta sugerencias diagnósticas y terapéuticas a la especialidad del médico
  - ✅ `generatePatientInstructions`: ya aceptaba `specialty` desde 11.1; route ya la cargaba de `doctor.specialty`
  - ✅ `AINoteGenerationService.loadClinicalContext`: carga `doctor.specialty` de Prisma y lo incluye en el contexto pasado a la IA
  - ✅ Route `ai-insights POST`: carga `doctor.specialty` desde `appointment.doctor.specialty` y lo pasa al contexto de `generateComprehensiveInsightsWithTelemetry`
  - ✅ Gobernanza preservada: `promptVersion` + `model` ya se registran en `AIUsageEvent` para todas las llamadas afectadas

- ✅ **11.9 Métricas por especialidad (operación y valor clínico)**
  - ✅ `GET /api/admin/ai/usage/summary`: agrega `bySpecialty` al response — carga `doctor.specialty` desde Prisma y lo incluye con totales (jobs, tokens, costo)
  - ✅ Dashboard `ia-gobernanza/page.tsx`: sección "Uso por especialidad" con tabla (especialidad, llamadas, tokens, costo) y etiquetas en español
  - ✅ Costo IA por especialidad visible en el período seleccionado
  - ✅ Tasa de aceptación de sugerencias IA ya existía en el mismo dashboard (byKind DIAGNOSIS/TREATMENT)

---

## Fase 12 — Operación de clínica y recepción avanzada

Escalar de “médico solo” a “equipo clínico operando diario” y dejar a MiDoc listo para venta a clínicas más exigentes.

- ✅ **12.1 Workflow de recepción** *(H6 Sub-fase A — 2026-04-25)*
  - ✅ Estados de recepción: ARRIVED → WAITING → IN_CONSULTATION → CHECKOUT_PENDING → COMPLETED
  - ✅ Endpoint `PATCH /api/agenda/admin/appointments/[id]/reception` con auditoría
  - ✅ Página `/medico/recepcion` con acciones rápidas, tiempo en sala y botón de cobro
  - ✅ Cobro atómico: `POST /api/agenda/admin/appointments/[id]/checkout` (DailyCashEntry + COMPLETED en una transacción)
  - ✅ `CobrarModal` reutilizable integrado en: Recepción, ConsultationWorkspace (post-firma), Agenda (día y semana)

- ✅ **12.2 Agenda por recursos** *(H6 Sub-fase C — 2026-04-25)*
  - ✅ Modelo `Resource` (ROOM/EQUIPMENT/UNIT) con `resourceId` en `Appointment`
  - ✅ `checkResourceConflict` — validación de solapamiento en creación de cita
  - ✅ Selector de recurso en formulario de agenda (opcional, con detección de conflicto)
  - ✅ Endpoint `GET /api/admin/resources/occupancy?date=` — citas por recurso por día
  - ✅ Vista de ocupación en `/medico/recursos` (tab “Ocupación por día”)

- ✅ **12.3 Caja y productividad** *(H6 Sub-fase B — 2026-04-25)*
  - ✅ `DailyCashEntry` — registro de cobros vinculados a cita o manual
  - ✅ Modelo `DayClosure` — cierre formal del día con snapshot de totales por método
  - ✅ `POST /api/agenda/admin/cash/close` — upsert idempotente, recalcula totales al re-cerrar
  - ✅ `/medico/caja` mejorada: totales live, banner de cierre, alerta de CHECKOUT_PENDING, actor visible por cobro
  - ⬜ Productividad por médico y secretaria (pendiente)
  - ⬜ Tablero de operación (pendiente)

- ⬜ **12.4 Permisos finos por rol**
  - Médico
  - secretaria
  - clinic admin
  - visibilidad/acceso granular

- ⬜ **12.5 Readiness comercial enterprise-light**
  - Data room básico:
    - arquitectura
    - seguridad
    - privacidad
    - backups
    - incident response
    - roadmap de certificación
  - One-pager comercial de seguridad/compliance
  - Registro claro de terceros/subprocesadores por entorno

---

## Fase 13 — Catálogo modular de planes y control de capacidades

Convertir MiDoc en un producto modular, donde Agenda, Sistema Médico y IA puedan contratarse como bundles independientes o combinados, con gating consistente en UI, API y suscripción.

- 🟡 **13.1 Esquema canónico de capacidades por suscripción**
  - `DoctorSubscription.features` se consolida como source of truth de capacidades activas
  - Capacidades mínimas propuestas:
    - `agenda.enabled`
    - `clinical.enabled`
    - `ai.enabled`
    - `agenda.reminders.whatsapp`
    - `agenda.waitlist`
    - `clinical.history`
    - `clinical.notes`
    - `clinical.prescriptions`
    - `clinical.signoff`
    - `clinical.encounters.standalone`
    - `ai.dictation`
    - `ai.insights`
    - `ai.questionnaire.text`
    - `ai.questionnaire.audio`
    - `ai.credits.enabled`
    - `specialty.core.enabled`
    - `specialty.family.enabled`
    - `specialty.pediatrics.enabled`
    - `specialty.obgyn.enabled`
    - `specialty.dermatology.enabled`
    - `specialty.cardiology.enabled`
    - `specialty.behavioral.enabled`
    - `specialty.dental.enabled`
    - `specialty.ophthalmology.enabled`
    - `ai.specialty.enabled`
  - Bundles permitidos:
    - Solo Agenda
    - Solo Clínico
    - Agenda + Clínico
    - Agenda + Clínico + IA
  - ✅ Inicio: `featureFlags.ts` y `productAccess.ts` ya priorizan capacidades canónicas (`agenda.enabled`, `clinical.enabled`, `ai.enabled`) sobre `planName` legacy cuando existen en `DoctorSubscription.features`
  - ✅ Inicio: `/api/admin/profile` ya expone `features` además de `productPlan/enabledModules` para transición controlada
  - ⬜ Pendiente: migrar login/session/proxy para que el token y layout usen `features` como fuente primaria y dejen `productPlan/enabledModules` solo como compatibilidad temporal

- 🔴 **13.2 Gating uniforme por módulo**
  - Helpers canónicos `canUseAgenda`, `canUseClinical`, `canUseAi`
  - Guards de API por módulo: agenda, clínico, IA
  - UI condicional por capacidad, no por nombre de plan
  - Reglas específicas de cuestionario pre-clínico:
    - Sin add-on IA: mostrar únicamente pregunta de texto libre **“Motivo de consulta”**
    - Con add-on IA: habilitar chat pre-clínico (`ai.questionnaire.text`) y/o audio pre-clínico (`ai.questionnaire.audio`) según capability
    - El fallback sin add-on no debe exponer chat IA ni captura de audio IA
  - Reglas de especialidad:
    - `specialty.core.enabled` y `specialty.<nombre>.enabled` habilitan funciones clínicas por especialidad para todos los planes
    - `ai.specialty.enabled` habilita copiloto IA por especialidad solo en planes IA
  - Reglas de error consistentes:
    - 401 no autenticado
    - 403 sin capacidad
    - 404 ruta no expuesta por plan

- 🔴 **13.3 Catálogo comercial y pricing**
  - Definir bundles comerciales con precio base y add-ons
  - IA como add-on premium para elevar ARPU sin obligar adopción
  - Separar pricing de permisos:
    - `basePlan`
    - `addOns`
    - `features`
  - Documentar matriz comercial:
    - qué incluye cada bundle
    - qué excluye
    - qué add-ons se pueden combinar
  - Política de créditos clínicos para cuestionario IA:
    - Consumo por **sesión de cuestionario completada** (no por turno)
    - Evento de cobro al cierre de sesión
  - Telemetría obligatoria por módulo IA (incluyendo cuestionario texto/audio) para costo y adopción

- 🔴 **13.4 Contratos funcionales y superficies públicas (roadmap)**
  - Capacidades/feature flags de planeación: `ai.questionnaire.text`, `ai.questionnaire.audio`, `ai.credits.enabled`, `specialty.core.enabled`, `specialty.<nombre>.enabled`, `ai.specialty.enabled`
  - Contrato funcional del cuestionario IA:
    - Entrada mínima: `motivo de consulta` + historial conversacional
    - Salida para médico: transcript conversacional + recomendaciones clínicas orientativas + checklist sugerido de exploración física
  - Contrato funcional por especialidad (backlog técnico):
    - Entrada: motivo + datos estructurados del playbook + historial clínico relevante
    - Salida base (sin IA): formulario/checklist + resumen por especialidad
    - Salida IA (planes IA): sugerencias, huecos, hipótesis orientativas y plan de revisión
  - Política de cobro asociada al contrato: consumo de crédito al cierre de sesión de cuestionario IA

## Benchmark competitivo por especialidad (referencia de mercado)

Subsección documental para alinear prioridades funcionales con patrones ya validados en software líder.

- Dentrix: dental charting, periodontograma e integración de imágenes odontológicas
- Epic (specialty modules): flujos especializados para cardiología, oncología y oftalmología
- athenahealth: plantillas/workflows por specialty practice
- AdvancedMD: templates y operación por especialidad ambulatoria
- ModMed (EMA): EHR verticalizado por especialidad (ej. derma, oftalmo)

Objetivo de producto: paridad funcional por especialidad en flujo clínico base + diferenciación con copiloto IA especializado en planes IA.

---

## Prioridad ejecutiva

### Lo que haría primero

**Sprint 1–2**
- Fase 13
- Fase 5
- Fase 10 en paralelo

**Sprint 3**
- Fase 13
- Fase 6

**Sprint 4**
- Fase 13
- Fase 7

**Sprint 5**
- Fase 13
- Fase 8

**Sprint 6**
- Fase 13
- Fase 9

**Después**
- Fase 11 *(dependiente de cerrar gating/capacidades, política de créditos y capacidades de especialidad en Fase 13)*
- Fase 12

---

## Decisiones clave (D1–D24) registradas

- **D1:** migrar a campos estructurados; segundo apellido opcional
- **D2:** Sexo (Hombre/Mujer/Intersexual) y Género (8 opciones) como selects
- **D3:** `PatientContact` reutilizable (opción B)
- **D4:** reCAPTCHA v3 implementado ya (no diferir)
- **D5:** "Usar mismo nombre" copia datos y setea relación=`SELF`
- **D6:** Fase 0 antes que Fase 1.1; commits incrementales
- **D7:** compliance se integra dentro del roadmap de producto, no como checklist separado
- **D8:** consentimiento, auditoría, retención y ARCO forman parte del sistema
- **D9:** pagos deben minimizar alcance PCI usando tokenización / hosted checkout
- **D10:** CFDI se diseña como arquitectura `CFDI-ready`, aunque el timbrado real pueda cerrarse después
- **D11:** teleconsulta requiere consentimiento y evidencia separados
- **D12:** la IA se comercializa como copiloto clínico / apoyo documental hasta definir estrategia regulatoria más profunda
- **D13:** la matriz NOM-004 / NOM-024 se trabaja como entregable vivo de producto + compliance
- **D14:** venta a clínicas más exigentes requiere data room y one-pager de seguridad/compliance
- **D15:** MiDoc se comercializa como bundles modulares: Agenda, Clínico y IA deben poder contratarse por separado o combinados, con `DoctorSubscription.features` como fuente de verdad de capacidades
- **D16:** cuestionario pre-clínico IA (texto y audio) requiere add-on IA
- **D17:** sin add-on IA, el fallback del cuestionario pre-clínico es únicamente “Motivo de consulta”
- **D18:** chat pre-clínico IA opera con máximo 5 preguntas totales (1 fija + 4 generadas por IA)
- **D19:** el consumo de créditos del cuestionario IA se contabiliza por sesión completada
- **D20:** cuestionario pre-clínico por voz incorpora detección inteligente de silencio para corte y avance automático
- **D21:** estrategia especialidad-first: funciones clínicas por especialidad se incluyen para todos los planes (con o sin IA)
- **D22:** IA por especialidad se habilita únicamente en planes IA mediante `ai.specialty.enabled`
- **D23:** catálogo inicial v1 de especialidades: medicina familiar, pediatría, gineco/ob, dermatología, cardiología, salud mental, odontología y oftalmología
- **D24:** métricas por especialidad son obligatorias para medir adopción, completitud clínica, tiempos y costo IA

## Notas operativas

- El entorno local usa Prisma con `--no-engine` (Accelerate-ready). Scripts que requieran conexión directa (p.ej. backfill) deben correr con `npx prisma generate` temporal, luego restaurar con `npm run db:generate:no-engine`.
- Los integration tests fallan en `setupTestDb.ts` por este mismo motivo (URL `prisma://`). No bloqueante para lógica pura — las pruebas de contrato pasan porque no tocan Prisma.
- Seed local: `tsx prisma/seed.ts` · credenciales admin: `admin@consultorio.com` / `admin123`.
- Todo entregable con componente legal/fiscal/regulatorio debe generar:
  - ticket técnico
  - ticket documental/legal
  - owner humano responsable
- Todo entregable con dependencia externa debe marcarse como `EXTERNAL_DEPENDENCY`
- No declarar cumplimiento comercial fuerte de expediente electrónico, privacidad avanzada o postura regulatoria de IA hasta cerrar evidencia mínima correspondiente

