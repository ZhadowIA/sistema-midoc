# 12 - Inventario funcional completo de V1

Fecha de levantamiento: 2026-06-09
Fuente: revision directa del codigo en `V1/consultorio-app` y `V1/whatsapp-bot` (esquema Prisma con ~50 modelos, 13 servicios de dominio, ~75 utilidades y ~30 grupos de endpoints), contrastada con `V1/consultorio-app/docs/SISTEMA_ACTUAL.md`.

## Como usar este documento

Cada funcion de V1 aparece con su decision de herencia para V2. **Todas las decisiones fueron revisadas y aprobadas el 2026-06-09.** Cambiar una decision requiere modificar este documento en un PR con justificacion (regla 11 de `REGLAS_DESARROLLO.md`).

Valores de decision:

| Valor | Significado |
|---|---|
| Conservar | Entra a V2 con el mismo concepto. |
| Adaptar | Entra a V2 pero rediseñada (casi siempre por la arquitectura local-first). |
| Diferir | No entra al MVP de V2; se reconsidera en pasos posteriores. |
| Omitir | No entra a V2. |

Columna **Destino**: en la arquitectura local-first de V2 (ver `01_contexto_v2.md`), cada funcion vive en la **App local** (ordenador del medico, datos clinicos), en el **Portal nube** (agenda publica, buzon temporal, cuenta SaaS) o en **Ambos**.

---

## 1. Identidad, acceso y seguridad de cuenta

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Registro de medico | Nombre, correo, telefono, password, aceptacion legal | Conservar (decidido) | Portal nube |
| Login/logout medico | JWT en cookie HttpOnly `med_token` | Adaptar (decidido): la app local autentica contra la nube solo para licencia/sync; sesion clinica es local | Ambos |
| Politica de contraseñas | `passwordPolicy.ts` | Conservar (decidido) | Portal nube |
| Bloqueo por intentos fallidos | `authLockout.ts`, `SecurityState` | Conservar (decidido) | Portal nube |
| Recuperacion de cuenta por correo | Token temporal, respuesta no enumerable | Conservar (decidido) | Portal nube |
| 2FA con codigos de recuperacion | `TwoFactorCredential`, `twoFactor.ts` | Diferir (decidido): paso 12 | Portal nube |
| Lista negra de tokens | `TokenBlacklist` | Conservar (decidido) | Portal nube |
| reCAPTCHA en formularios publicos | `recaptcha.ts` | Conservar (decidido) | Portal nube |
| Rate limiting | `rateLimit.ts`, `rateLimitCore.ts` | Conservar (decidido) | Portal nube |
| Aceptacion legal versionada | `LegalAcceptance`, `TERMS_VERSION`/`PRIVACY_VERSION` | Conservar (decidido) | Ambos |
| Login/registro de paciente | Cuenta de paciente con portal propio | Conservar (decidido) | Portal nube |

## 2. Suscripcion SaaS y acceso por producto

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Suscripcion del medico | `DoctorSubscription`, flujo register → subscribe → onboarding | Adaptar (decidido): la suscripcion ahora licencia la app instalable | Portal nube |
| Catalogo de planes | `subscriptionCatalog.ts`, `stripeCatalog.ts` | Conservar (decidido) | Portal nube |
| Integracion Stripe | `stripe.ts` (checkout placeholder + webhook idempotente `PaymentWebhookEvent`) | Conservar (decidido) | Portal nube |
| Gating por capacidades/plan | `capabilities.ts`, `productAccess.ts`, `subscriptionFeatures.ts`, `featureFlags.ts` | Adaptar (decidido): la app local debe respetar el plan aun sin conexion (licencia con gracia offline) | Ambos |
| Onboarding guiado | `DoctorOnboarding`, `setupStatus.ts` | Adaptar (decidido): el onboarding termina en instalar la app | Ambos |
| Panel interno de operador | `api/internal-admin/*` (clientes, ops, seguridad) | Adaptar (decidido): solo ve datos de cuenta/suscripcion, nunca datos clinicos (ya no existen en nube) | Portal nube |

## 3. Perfil, configuracion y consultorio

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Perfil publico del medico | Slug, especialidad, cedula, branding, logo (`/doctor/[slug]`) | Conservar (decidido) | Portal nube |
| Configuracion del medico | `DoctorConfig`: duraciones, precios, reglas de recordatorio, templates | Adaptar (decidido): se divide entre config publica (agenda) y config local (clinica) | Ambos |
| Catalogo de servicios | `DoctorService`: precio, duracion, activo/inactivo | Conservar (decidido) | Portal nube |
| Clinica multi-asiento y secretarias | `Clinic`, `clinicSeats.ts`, `api/medico/secretaries` | Diferir (decidido): multi-usuario local-first es complejo; un dispositivo por consultorio en MVP | — |
| Recursos fisicos (consultorios, equipos) | `Resource`, `resourceConflict.ts` | Diferir (decidido): paso 10 | App local |

## 4. Agenda y disponibilidad del medico

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Disponibilidad semanal | `AvailabilityBlock` con reglas y excepciones | Conservar (decidido) | Portal nube (lectura publica), editable desde app |
| Bloqueos de horario | `ScheduleBlock`, generacion de horario | Conservar (decidido) | Ambos |
| Agenda dia/semana del medico | `api/admin/agenda/day`, `week`, `server/agenda/*` | Conservar (decidido): vista principal de la app local | App local |
| Dashboard con resumen | `api/agenda/admin/dashboard/summary` | Conservar (decidido) | App local |

## 5. Agendado publico (paciente)

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Directorio publico de doctores | `GET /api/public/doctors` | Conservar (decidido) | Portal nube |
| Disponibilidad publica dia/mes | `api/public/availability`, `/month` | Conservar (decidido) | Portal nube |
| Hold temporal de horario | TTL 5 min, `slotHold.ts` | Conservar (decidido) | Portal nube |
| Crear cita (invitado o con cuenta) | `bookAsGuest`, vinculo a cuenta paciente | Conservar (decidido) | Portal nube |
| Confirmar/cancelar/reagendar por token | `appointmentActionToken.ts`, enlaces de accion | Conservar (decidido) | Portal nube |
| Enlaces cortos | `ShortLink`, ruta `/r/[code]` | Conservar (decidido): requisito V2 para SMS | Portal nube |
| Funnel de reserva (analitica) | `BookingFunnelEvent`, `api/admin/funnel` | Diferir (decidido) | Portal nube |
| Lista de espera con ofertas | `WaitlistEntry`, `WaitlistOffer`, `WaitlistService` | Diferir (decidido): paso 10 | Portal nube |
| Depositos/anticipos de cita | `depositPolicy.ts`, `AppointmentPaymentStatus`, `DepositRefundMode` | Diferir (decidido): paso 10 | Portal nube |
| Citas creadas por el medico | Con paciente existente o nuevo, validacion de traslapes | Conservar (decidido) | App local (publica el hueco a nube) |

## 6. Pacientes y expediente clinico

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Directorio de pacientes por medico | `Patient` con `ownerDoctorId`, dedupe por nombre+telefono | Conservar (decidido) | App local |
| Vinculo expediente ↔ cuenta paciente | `link-account`, `userId` opcional | Adaptar (decidido): el vinculo es entre expediente local y cuenta de portal; solo viaja un identificador | Ambos |
| Fusion de expedientes | `patients/merge` | Conservar (decidido) | App local |
| Contactos del paciente | `PatientContact` | Conservar (decidido) | App local |
| Historia clinica versionada | `ClinicalHistory` + `ClinicalHistoryVersion`, `ClinicalHistoryService` | Conservar (decidido) | App local |
| Encuentros clinicos | `ClinicalEncounter`, `EncounterHistory` + versiones, consulta sin cita | Conservar (decidido) | App local |
| Nota SOAP versionada con cierre/firma | `ClinicalNote` + `ClinicalNoteVersion`, `clinicalSignature.ts` | Conservar (decidido) | App local |
| Receta | `Prescription` | Conservar (decidido) | App local |
| Plantillas por especialidad | `specialtyTemplates.ts`, `specialtyPayloadSchemas.ts` | Adaptar (decidido): solo medicina general/familiar y odontologia | App local |
| Modulo dental | `dentalPayload.ts`, componentes odontograma/periodontograma | Conservar (decidido): paso 8 | App local |
| Resumen longitudinal | `longitudinalSummary.ts` | Conservar (decidido) | App local |
| Brechas clinicas | `clinicalGapsService.ts` | Diferir (decidido): paso 11 (IA) | App local |
| Workspace unificado de consulta | `consultationWorkspace.ts`, acta piloto en docs | Conservar (decidido): es el corazon del concepto V2 "atencion integrada" | App local |

## 7. Preconsulta, documentos y consentimientos

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Cuestionario preconsulta por token | `Questionnaire`, `QuestionnaireService`, `/cuestionario/[token]` | Conservar (decidido) | Portal nube (captura) → App local (destino final, buzon se vacia) |
| Pre-checkin del paciente | `PatientPreCheckin`, `/paciente/pre-checkin` | Conservar (decidido) | Portal nube → App local |
| Documentos clinicos del paciente | `PatientDocument`, categorias, estados | Adaptar (decidido): almacenamiento local cifrado, no Azure | App local |
| Carga de estudios por enlace temporal | `/subir-estudios/[token]`, `appointmentUploads.ts` | Adaptar (decidido): el portal recibe y la app local descarga y purga el buzon | Portal nube → App local |
| Almacenamiento Azure Blob | `azureBlob.ts` | Omitir (decidido): contradice el objetivo local-first; solo buzon temporal cifrado | — |
| Consentimientos digitales | `ConsentCapture`, `DigitalConsent`, tipos y actores | Conservar (decidido) | App local |

## 8. Portal del paciente

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Historial de citas del paciente | `api/auth/patient/history` | Adaptar (decidido): solo metadatos de cita; lo clinico no vive en nube | Portal nube |
| Gestion de cita propia | CONFIRM / CANCEL / RESCHEDULE | Conservar (decidido) | Portal nube |
| Historial clinico / resumen autorizado | `/paciente/historial`, `patientPortalContext.ts` | Adaptar (decidido): el medico publica explicitamente un resumen (PDF cifrado o enlace temporal); no hay expediente permanente en nube | App local → Portal nube (temporal) |
| Cuenta del paciente | `/paciente/cuenta` | Conservar (decidido) | Portal nube |

## 9. IA clinica

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Audio → transcripcion → SOAP | `aiNoteService.ts`, `AINoteGenerationService`, OpenAI + Deepgram (`deepgramClient.ts`) | Adaptar (decidido): transcripcion local (Whisper en dispositivo) como primera opcion; nube solo con consentimiento y seudonimizado | App local |
| Seudonimizacion | `pseudonymization.ts` | Conservar (decidido): pieza clave si se usa IA en nube | App local |
| Insights IA (dx, tx, dieta) | `AIInsight`, `aiInsights.ts` | Conservar (decidido): paso 11 | App local |
| Validacion de receta (farmacovigilancia) | `ai-validate`, reglas deterministicas + dedupe | Conservar (decidido): las reglas deterministicas pueden correr 100% local | App local |
| Consentimiento IA por consulta | `AiConsentState` | Conservar (decidido) | App local |
| Creditos IA y precios | `ClinicalCredit`, `ClinicalCreditTransaction`, `aiPricing.ts`, `aiCreditsMiddleware.ts` | Adaptar (decidido): los creditos se compran en nube y se consumen desde la app | Ambos |
| Limites y telemetria de uso IA | `AIUsageEvent`, `AIUsageMonthlySummary`, `aiUsageLimits.ts`, `aiTelemetry.ts` | Adaptar (decidido): telemetria sin contenido clinico | Ambos |
| Feedback sobre salidas IA | `AIInsightFeedback` | Conservar (decidido) | App local |
| Jobs de procesamiento IA | `AIProcessingJob` | Conservar (decidido) | App local |

## 10. Notificaciones y comunicaciones

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Cola de notificaciones multi-canal | `Notification` (WhatsApp/SMS/EMAIL), cron interno con secret | Conservar (decidido): canales SMS y correo | Portal nube |
| Recordatorios configurables | Horas de anticipacion, ventana, comportamiento segun estado de cita | Conservar (decidido) | Portal nube (config sincronizada desde app) |
| Reintentos y escalamiento | Variables `NOTIFICATION_*`, retry/escalation/auto-close | Conservar (decidido) | Portal nube |
| Templates por medico con preview/test | `whatsappTemplatePreview.ts`, endpoints de preview/test-send | Adaptar (decidido): templates para SMS/correo | Portal nube |
| Proveedor SMS | `smsProvider.ts`, Twilio (`api/internal/twilio`) | Conservar (decidido) | Portal nube |
| Proveedor correo | `emailProvider.ts` | Conservar (decidido) | Portal nube |
| Bot WhatsApp completo | `whatsapp-bot/` (whatsapp-web.js), QR por doctor, webhook entrante, intents confirmar/cancelar, `WhatsAppMessageLog` | **Omitir (decidido 2026-06-09)**: whatsapp-web.js usa una API no oficial con riesgo real de baneo del numero del medico; SMS y correo lo sustituyen. WhatsApp solo se reconsideraria via la API oficial de Meta (WhatsApp Business Platform), como canal futuro del paso 7, nunca con clientes no oficiales | — |

## 11. Pagos, caja y contabilidad

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Checkout y webhook de pagos | `api/payments/*`, idempotencia, MOCK/STRIPE/CONEKTA/OPENPAY | Conservar (decidido): para la suscripcion del medico | Portal nube |
| Reconciliacion de pagos | `api/internal/payments/reconcile` | Conservar (decidido) | Portal nube |
| Recibos | `BillingReceipt`, `billingReceipt.ts` | Adaptar (decidido): recibos de consulta se generan localmente | App local |
| Caja diaria y cierre | `DailyCashEntry`, `DayClosure`, `/medico/caja` | Diferir (decidido): paso 10 | App local |
| Contabilidad | `/medico/contabilidad` | Diferir (decidido): paso 10 | App local |
| Recepcion | `/medico/recepcion`, estados operativos | Diferir (decidido): paso 10 | App local |

## 12. Cumplimiento, auditoria y operacion

| Funcion V1 | Detalle | Decision V2 | Destino |
|---|---|---|---|
| Auditoria de citas | `AppointmentAuditLog` (actor + source en cada cambio critico) | Conservar (decidido) | Ambos (cada lado audita lo suyo) |
| Auditoria general | `AuditLog`, `AuditLogService`, `clinicalAudit.ts` | Conservar (decidido) | Ambos |
| Solicitudes ARCO | `ArcoRequest`, `/api/admin/arco` | Adaptar (decidido): se simplifica — el medico atiende ARCO desde su app porque los datos son suyos | App local |
| Politicas de retencion y borrado | `DataRetentionPolicy`, `DataDeletionLog`, `retention-policies` | Conservar (decidido) | App local (+ purga automatica del buzon en nube) |
| Incidentes de seguridad | `SecurityIncident`, `server/security/incidents` | Diferir (decidido): paso 12 | Portal nube |
| Observabilidad y health checks | `observability.ts`, `api/health`, `ready` | Conservar (decidido) | Portal nube |
| Zona horaria por medico | `timezone.ts`, `dateTime.ts` | Conservar (decidido) | Ambos |

## 13. Funciones nuevas que V1 no tiene (nacen en V2)

Estas no provienen de V1 pero son consecuencia directa de la arquitectura local-first:

| Funcion nueva | Detalle |
|---|---|
| Base de datos local cifrada | SQLite + SQLCipher en el ordenador del medico; llave derivada de credencial local. |
| Sincronizacion app ↔ buzon nube | Descarga de citas/preconsultas/documentos del buzon, publicacion de disponibilidad, purga del buzon tras descarga. |
| Respaldo cifrado | Respaldo automatico local (disco/carpeta) y opcional a nube con cifrado del lado del cliente (llave solo del medico). |
| Restauracion de respaldo | Flujo probado de recuperacion ante perdida del equipo. |
| Empaquetado e instalador | Builds firmados de la app de escritorio (Windows primero), auto-actualizacion. |
| Transcripcion local | Whisper (u otro modelo) corriendo en el dispositivo para el pipeline de notas. |
| Licencia offline | La app valida suscripcion contra la nube con periodo de gracia sin conexion. |

## Resumen para la decision

- **Conservar (decidido):** ~45 funciones — el nucleo agenda + expediente + nota + receta + notificaciones + seguridad.
- **Adaptar (decidido):** ~20 funciones — todo lo que toca datos clinicos cambia de residencia (nube → app local) y todo lo SaaS cambia de "app web" a "licencia de app instalable".
- **Diferir (decidido):** ~12 funciones — operacion presencial (caja, recepcion, lista de espera, recursos), multi-asiento/secretarias, funnel, depositos, 2FA, incidentes.
- **Omitir:** bot de WhatsApp (API no oficial, riesgo de baneo) y almacenamiento clinico en Azure Blob (contradice el local-first). Ambos decididos.

El contraste detallado con los requerimientos V2 esta en `09_contraste_v1_v2.md` y la tabla de herencia en `07_capacidades_heredadas_y_alcance.md`; este inventario los complementa con el nivel de detalle del codigo real.
