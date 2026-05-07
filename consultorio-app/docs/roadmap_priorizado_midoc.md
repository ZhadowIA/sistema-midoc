# Roadmap Priorizado — MiDoc

**Fecha:** 2026-04-23  
**Base:** `consultorio-app/docs/roadmap_fases_midoc.md`  
**Objetivo:** convertir MiDoc de MVP clínico avanzado a SaaS comercializable, seguro y escalable.

Este roadmap NO reemplaza al roadmap histórico por fases. Es una ruta ejecutiva priorizada para decidir qué construir primero según valor de producto, riesgo comercial, seguridad y deuda técnica.

---

## Principios de decisión

1. **Monetización antes que features vistosas**  
   Si el producto no cobra bien, no hay SaaS. Primero pagos, no-show y autoservicio.

2. **Capacidades como contrato del producto**  
   `DoctorSubscription.features` debe ser la fuente de verdad para UI, API, proxy y billing.

3. **Seguridad en profundidad**  
   No basta esconder botones. Toda capacidad comercial debe tener guard en backend.

4. **IA gobernada, no IA decorativa**  
   En salud, cada uso de IA debe tener trazabilidad, costo, modelo, versión de prompt y acción humana.

5. **Arquitectura incremental**  
   No hacer una “gran reescritura”. Extraer dominios y eliminar deuda por verticales.

---

# Horizonte 0 — Cierre comercial pre-go-live

**Objetivo:** que MiDoc pueda cobrar, reducir no-show y operar con menor riesgo comercial.

**Prioridad:** P0  
**Fases relacionadas:** 5.1, 5.2, 5.3, 5.4, 10.4

## 0.1 Anticipo real por cita con Stripe

**Estado:** ✅ completado en local — checkout de anticipo, webhook `DEPOSIT_PAID` y validación end-to-end con Stripe test completados; pendiente repetir smoke en producción al desplegar.

### Alcance

- Crear flujo de pago de anticipo para citas públicas con `paymentStatus=PAYMENT_PENDING`.
- Generar sesión Stripe Checkout para el anticipo.
- Procesar webhook validado e idempotente.
- Actualizar cita a `DEPOSIT_PAID` cuando Stripe confirme pago.
- Mantener expiración de apartados sin pago.

### Entregables

- Endpoint para iniciar pago de anticipo.
- Webhook conectado a citas.
- Auditoría de cambio de estado de pago.
- Tests unitarios/integración del flujo principal.
- Caso de regresión E2E cuando exista cuenta Stripe real.

### Criterio de aceptación

Una cita con anticipo requerido no queda plenamente confirmada hasta que Stripe confirme el pago.

### Riesgos

- Estados duplicados entre Stripe y DB.
- Webhooks repetidos.
- Cancelaciones cerca del vencimiento.

### Decisión recomendada

Usar **Stripe Checkout** para v1. Reduce superficie PCI y acelera salida comercial.

---

## 0.2 UI médica para política de anticipo y no-show

**Estado:** ✅ completado en UI local — `/medico/configuracion?tab=parametros` expone activación de anticipo, monto, vencimiento, ventana de cancelación, modo de reembolso, porcentaje parcial y vista previa para paciente.

### Alcance

- Exponer configuración existente de `DoctorConfig` en `/medico/configuracion`.
- Permitir configurar:
  - anticipo habilitado
  - monto
  - vencimiento del pago
  - ventana de cancelación
  - modo de reembolso
  - porcentaje de reembolso parcial

### Entregables

- Sección “Política de pagos y no-show”.
- Validaciones de monto y ventanas.
- Preview de la política que verá el paciente.
- Auditoría de cambios de configuración.

### Criterio de aceptación

El médico puede modificar su política sin tocar variables de entorno ni base de datos manualmente.

---

## 0.3 Autoservicio básico de cobro

**Estado:** ✅ completado en UI/API local — `/medico/suscripcion` muestra estado comercial, próxima renovación, método de pago, último pago, monto, estado de impago/cancelación/grace period operativo e historial reciente de eventos Stripe asociados a la suscripción.

### Alcance

- Completar pantalla “Mi suscripción”.
- Mostrar:
  - estado actual
  - próxima renovación
  - método de pago
  - historial de cobros
  - estado de impago/grace period

### Entregables

- UI en `/medico/suscripcion`.
- Sincronización mínima con Stripe.
- Estados claros para pago fallido, cancelación y reactivación.

### Criterio de aceptación

El médico entiende si su cuenta está activa, vencida, cancelada o en periodo de gracia.

---

# Horizonte 1 — Control de capacidades y seguridad modular

**Objetivo:** que el producto pueda venderse por módulos sin huecos de seguridad ni lógica duplicada.

**Prioridad:** P0  
**Fases relacionadas:** 13.1, 13.2, 12.4

## 1.1 `DoctorSubscription.features` como fuente de verdad

**Estado:** ✅ base canónica implementada — se centralizó el catálogo de capacidades en `src/lib/subscriptionFeatures.ts`; `featureFlags`, `productAccess`, `capabilities` y `subscriptionCatalog` consumen ese contrato común. Pendiente migración completa de todos los guards API del bloque 1.2.

### Alcance

- Migrar login/session/proxy/layout para usar `features` como contrato primario.
- Mantener `productPlan` y `enabledModules` solo como compatibilidad temporal.
- Definir catálogo canónico de capacidades.

### Capacidades mínimas

```txt
agenda.enabled
agenda.reminders.whatsapp
agenda.waitlist
clinical.enabled
clinical.history
clinical.notes
clinical.prescriptions
clinical.signoff
clinical.encounters.standalone
ai.enabled
ai.dictation
ai.insights
ai.questionnaire.text
ai.questionnaire.audio
ai.credits.enabled
specialty.core.enabled
ai.specialty.enabled
```

### Entregables

- Helper central de capacidades.
- Normalizador de features.
- Tests unitarios de combinaciones de plan.
- Documentación del catálogo.

### Criterio de aceptación

La UI, el proxy y las APIs toman la misma decisión para permitir o bloquear una capacidad.

---

## 1.2 Guards de API por módulo

**Estado:** ✅ completado — se estandarizaron guards modulares en `src/lib/medicalApi.ts` (`requireAgendaAccess`, `requireClinicalAccess`, `requireAiAccess`, `requireFeature`) y se aplicaron guards por feature en endpoints de waitlist (`agenda.waitlist`) y recordatorios/cola de notificaciones (`agenda.reminders.whatsapp`). Los namespaces `/api/agenda/*` y `/api/clinical/*` mantienen enforcement vía rutas fuente (`/api/admin/*`) y guards de módulo.

### Alcance

Crear guards reutilizables:

```ts
requireAgendaAccess()
requireClinicalAccess()
requireAiAccess()
requireFeature("ai.questionnaire.text")
```

Aplicarlos a:

- `/api/agenda/*`
- `/api/clinical/*`
- endpoints IA
- endpoints de waitlist
- endpoints de WhatsApp reminders

### Criterio de aceptación

Una cuenta sin módulo clínico no puede acceder a endpoints clínicos aunque conozca la URL.

---

## 1.3 Permisos finos por rol

**Estado:** ✅ completado — `src/lib/permissions.ts` consolida matriz explícita por rol y helper `can(user, permission, context)`; se agregaron pruebas unitarias de permisos críticos en `src/tests/unit/permissions.test.ts` y se aplicó migración gradual de checks de rol en endpoints administrativos/clinical clave.

### Alcance

Crear matriz explícita de permisos:

```txt
appointment:create
appointment:update
appointment:reschedule
clinical-note:read
clinical-note:write
clinical-note:sign
billing:read
billing:manage
clinic:manage-doctors
clinic:manage-seats
security:incident-read
security:incident-write
```

### Entregables

- Helper `can(user, permission, context)`.
- Matriz inicial por rol.
- Tests de permisos críticos.
- Migración gradual de `if role === ...` dispersos.

### Criterio de aceptación

Los permisos de `DOCTOR`, `SECRETARY` y `CLINIC_ADMIN` son explícitos y testeables.

---

# Horizonte 2 — Reducción de deuda arquitectónica

**Objetivo:** separar dominios y evitar que las rutas legacy sigan creciendo.

**Prioridad:** P1  
**Fases relacionadas:** 13.2, 10.1, 12.5

## 2.1 Extraer capa de aplicación por dominio

**Estado:** ✅ completado — se consolidó capa de aplicación por dominio en `src/server/agenda`, `src/server/clinical`, `src/server/billing`, `src/server/subscription` y `src/server/security`; rutas API críticas quedaron como adaptadores delgados (validan request/auth y delegan casos de uso a `src/server/*`).

### Problema actual

Existen rutas modulares como `/api/agenda` y `/api/clinical`, pero varias delegan o reexportan rutas legacy bajo `/api/admin`.

Eso fue correcto para migrar rápido, pero no debe ser el destino final.

### Alcance

Crear estructura:

```txt
src/server/agenda
src/server/clinical
src/server/billing
src/server/subscription
src/server/security
```

Cada dominio debe exponer casos de uso, no lógica pegada a route handlers.

### Criterio de aceptación

Las rutas se vuelven adaptadores delgados: validan request, llaman caso de uso y responden.

---

## 2.2 Eliminar reexports gradualmente

**Estado:** ✅ completado — se migró ownership real por vertical a namespaces modulares (`/api/agenda/admin/*` y `/api/clinical/admin/*`) para Agenda, Billing, Clinical Patients y AI endpoints; las rutas legacy en `/api/admin/*` quedaron como compatibilidad deprecada apuntando a los nuevos namespaces.

### Alcance

Migrar por vertical:

1. Agenda.
2. Billing.
3. Clinical patients.
4. Clinical encounters.
5. AI endpoints.

### Regla

No migrar todo de golpe. Cada vertical debe quedar con tests antes de avanzar.

### Criterio de aceptación

Cada namespace nuevo tiene ownership real, no solo alias de rutas antiguas.

---

## 2.3 Observabilidad de performance por endpoint crítico

**Estado:** ✅ completado — se instrumentó `durationMs` con logs estructurados y umbrales `warning/critical` en endpoints críticos: dashboard summary, agenda day/week, availability slots, public booking, notifications process, payments webhook y AI note generate.

### Alcance

Instrumentar duración en:

- dashboard summary
- agenda day/week
- availability slots
- public booking
- notification processing
- payment webhook
- AI note generation

### Entregables

- Logs estructurados con `durationMs`.
- Umbrales warning/critical.
- Documentación en observability.

### Criterio de aceptación

Antes de optimizar queries, el sistema sabe qué endpoint es lento y cuánto tarda.

---

# Horizonte 3 — IA clínica gobernada

**Objetivo:** pasar de IA útil a IA monetizable, segura y medible.

**Prioridad:** P1  
**Fases relacionadas:** 11.1, 11.2, 11.3, 11.4, 13.1

## 3.1 Trazabilidad y costos de IA

**Estado:** ✅ completado — se creó tabla canónica `AIUsageEvent` (Prisma + migración), contrato central en `src/lib/aiTelemetry.ts` + precios por modelo en `src/lib/aiPricing.ts`, instrumentación en `AINoteGenerationService` y endpoints clínicos (`ai-insights`, `ai-validate`, `generate-from-transcript`), endpoint de resumen `GET /api/admin/ai/usage/summary` y sección “IA uso y costo” en `/medico/dashboard`.

### Alcance

Ampliar tracking de jobs IA con:

- modelo usado
- versión de prompt
- proveedor
- tokens estimados entrada/salida
- costo estimado
- duración
- médico/clinicId
- módulo origen

### Entregables

- Campos nuevos o payload normalizado en `AIProcessingJob`.
- Helper central para registrar uso IA.
- Dashboard interno básico de uso/costo.

### Criterio de aceptación

Se puede responder cuánto cuesta IA por médico, módulo y periodo.

---

## 3.2 Aceptación/rechazo de sugerencias IA

**Estado:** ✅ completado — se implementó trazabilidad explícita de acciones humanas sobre sugerencias IA con tabla `AIInsightFeedback` (aplicada/rechazada/editada/ignorada), endpoint enriquecido `/api/clinical/admin/appointments/[id]/ai-insights/apply`, eventos de auditoría `AI_INSIGHT_ACTION`, controles UI en `AiInsightsPanel` y endpoint de métricas base `GET /api/admin/ai/insights/feedback/summary`.

### Alcance

Registrar acción humana sobre sugerencias:

- aplicada
- rechazada
- editada
- ignorada

### Entregables

- Eventos de auditoría.
- Metadata en `AIInsight` o tabla relacionada.
- Métricas de utilidad.

### Criterio de aceptación

El sistema puede medir qué sugerencias realmente ayudan al médico.

---

## 3.3 Límites regulatorios visibles

**Estado:** ✅ completado — se incorporaron disclaimers explícitos en módulos IA clínicos (`ConsultationWorkspace`, `DictationPanel`, `AiInsightsPanel`), se reforzó el mensaje en consentimiento IA (`AiConsentModal`) y se documentó política interna de claims permitidos/prohibidos en `docs/compliance/ai-claims-policy.md`.

### Alcance

- Disclaimers claros en módulos IA.
- Diferenciar sugerencia clínica de decisión médica.
- Consentimiento específico donde aplique.
- Documento interno de claims permitidos/prohibidos.

### Criterio de aceptación

La UI y el material comercial no prometen diagnóstico autónomo.

---

# Horizonte 4 — Valor clínico diferencial

**Objetivo:** aumentar productividad médica real, no solo automatización superficial.

**Prioridad:** P1/P2  
**Fases relacionadas:** 11.1, 11.2, 11.5, 11.6, 11.7, 11.8, 11.9

## 4.1 Cuestionario pre-clínico IA conversacional por texto

**Estado:** ✅ completado — se habilitó entrevista IA conversacional por texto en cuestionario público (`/cuestionario/[token]`), enviando historial completo por turno al endpoint `/api/clinical/public/questionnaire/[token]/ai-interview`; se reforzó en prompt “máximo 4 preguntas adicionales” y “evitar repetidas”, y se agregó salida de resumen + posibles padecimientos orientativos + checklist sugerido de exploración física. También se aplicó gating por capacidades (`ai.enabled` + `ai.questionnaire.text`).

### Alcance

- Pregunta inicial fija: “Motivo de consulta”.
- Máximo 4 preguntas adicionales generadas por IA.
- Enviar historial completo en cada turno.
- Evitar preguntas repetidas.
- Mostrar al médico:
  - conversación completa
  - resumen clínico
  - posibles padecimientos orientativos
  - checklist sugerido de exploración física

### Gating

Requiere:

```txt
ai.enabled = true
ai.questionnaire.text = true
```

### Criterio de aceptación

El médico recibe información preconsulta útil sin que el paciente tenga que llenar un formulario largo tradicional.

---

## 4.2 Detección de huecos clínicos

### Alcance

Detectar:

- alergias faltantes
- medicamentos incompletos
- antecedentes críticos ausentes
- contradicciones básicas
- red flags que requieren revisión

### Criterio de aceptación

La IA no solo genera texto; ayuda a encontrar omisiones clínicas.

---

## 4.3 Plantillas por especialidad v1

**Estado:** ✅ completado — se implementó tipado estricto `MedicalSpecialty`, se refactorizaron las rutas y los seeders, y se habilitó la resolución dinámica de `SpecialtyTemplate` dentro del flujo clínico (`ConsultationWorkspace.tsx`).

### Especialidades iniciales

1. Medicina familiar.
2. Pediatría.
3. Ginecología/Obstetricia.
4. Dermatología.
5. Cardiología.
6. Salud mental.
7. Odontología.
8. Oftalmología.

### Entregables por especialidad

- Plantilla clínica estructurada.
- Checklist de exploración.
- Red flags.
- Criterios de referencia.
- Seguimiento sugerido.

### Criterio de aceptación

Cada especialidad debe reducir tiempo de captura o mejorar calidad documental de manera observable.

---

## 4.4 Cuestionario IA por voz

### Condición previa

No iniciar hasta validar el flujo de texto.

### Alcance

- VAD/silencio inteligente.
- Timeout configurable.
- Transcripción por respuesta.
- Avance automático entre preguntas.
- Control de costo de transcripción.

### Criterio de aceptación

La voz mejora conversión o calidad de respuesta frente al texto; si no, no se justifica.

---

# Horizonte 5 — Captación, conversión y crecimiento

**Objetivo:** que MiDoc ayude a conseguir y recuperar citas, no solo administrarlas.

**Prioridad:** P2  
**Fases relacionadas:** 8.1, 8.2, 8.3, 8.4

## 5.1 Tracking de funnel de reserva

### Eventos mínimos

```txt
booking_visit
booking_started
doctor_selected
slot_selected
patient_info_started
patient_info_completed
booking_confirmed
payment_started
payment_completed
appointment_completed
```

### Fuentes

```txt
instagram
whatsapp
google_business
website
campaign
manual
unknown
```

### Criterio de aceptación

El médico puede saber qué canal genera citas reales, no solo visitas.

---

## 5.2 Links por canal y campañas

### Alcance

- Links específicos para Instagram, WhatsApp, Google Business y campañas.
- Persistir `source`, `campaign`, `medium` en la reserva.
- Reportar conversión por canal.

### Criterio de aceptación

Una cita puede atribuirse a su fuente comercial.

---

## 5.3 Recuperación de agendado abandonado

### Alcance

- Detectar inicio de reserva sin confirmación.
- Recuperar por WhatsApp o email cuando exista consentimiento/contacto.
- Medir recuperación.

### Riesgo

Debe cuidarse consentimiento y privacidad. No perseguir pacientes sin base válida.

---

# Horizonte 6 — Operación clínica avanzada

**Objetivo:** preparar MiDoc para clínicas con recepción, caja y recursos compartidos.

**Prioridad:** P2/P3  
**Fases relacionadas:** 12.1, 12.2, 12.3, 12.5

## 6.1 Workflow de recepción

### Estados sugeridos

```txt
scheduled
arrived
waiting
in_consultation
checkout_pending
completed
no_show
```

### Criterio de aceptación

Recepción puede operar el flujo diario sin depender del médico.

---

## 6.2 Caja y cierre diario

### Alcance

- Registro de cobros por día.
- Corte por clínica/médico/secretaria.
- Diferenciar efectivo, transferencia y tarjeta.
- Reporte de productividad.

### Criterio de aceptación

Una clínica puede cerrar el día operativo desde MiDoc.

---

## 6.3 Agenda por recursos

### Recursos

- consultorio
- sala
- equipo
- unidad dental/equipo especializado

### Criterio de aceptación

No se puede reservar una cita si el recurso requerido está ocupado.

---

# Horizonte 7 — Teleconsulta y seguimiento

**Objetivo:** abrir un segundo modo de atención sin comprometer seguridad, cobro ni consentimiento.

**Prioridad:** P3  
**Fases relacionadas:** 9.1, 9.2, 9.3, 9.4, 9.5

## 7.1 Cita virtual

### Alcance

- Tipo de cita virtual.
- Enlace de videollamada.
- Instrucciones previas.

### Condiciones previas

- Pago previo/anticipo estable.
- Consentimiento específico.
- Trazabilidad de eventos.

---

## 7.2 Consentimiento de teleconsulta

### Alcance

- Consentimiento versionado por cita.
- Metadata de aceptación.
- Vinculación con consulta.

---

## 7.3 Seguimiento postconsulta

### Alcance

- Mensajes a 24 h, 72 h y 7 días.
- Registro de respuesta/evolución.
- Escalamiento si aparece red flag.

---

# Orden ejecutivo recomendado

## Sprint A — Cobro y no-show

1. Anticipo Stripe.
2. Webhook `DEPOSIT_PAID`.
3. UI política de no-show.
4. Regresión de pagos.

## Sprint B — Capacidades y guards

1. Catálogo canónico de features.
2. Helpers `canUse*` / `requireFeature`.
3. Migrar proxy/session/layout.
4. Guards API por namespace.

## Sprint C — Deuda modular

1. Extraer dominio agenda.
2. Extraer dominio billing.
3. Reducir reexports `/api/agenda`.
4. Instrumentar performance.

## Sprint D — Gobernanza IA

1. Costos y trazabilidad de IA.
2. Registro aceptar/rechazar/editar.
3. Disclaimers y claims internos.
4. Dashboard básico de uso IA.

## Sprint E — Valor clínico IA

1. ~~Cuestionario IA texto.~~ ✅ completado
2. ~~Detección de huecos clínicos.~~ ✅ completado — enfoque híbrido determinista (auto, gratis) + LLM on-demand (gpt-4o); `clinicalGapsService.ts`, `ClinicalGapsPanel.tsx`, endpoint POST `/encounters/[id]/gaps`, 14 tests unitarios.
3. Plantillas por especialidad v1.
4. Voz solo si texto demuestra valor.

---

# Lo que NO conviene priorizar todavía

## Teleconsulta completa

Atractiva, pero depende de pagos, consentimiento y trazabilidad. Si se implementa antes, aumenta riesgo sin cerrar monetización principal.

## Cuestionario IA por voz

Es vistoso, pero suma complejidad de VAD, ruido, transcripción y costo. Primero texto.

## Omnicanal avanzado

Útil, pero primero hay que cerrar atribución básica y funnel antes de construir campañas sofisticadas.

## Reescritura completa de arquitectura

No. MiDoc ya tiene producto. La estrategia correcta es extracción incremental por dominio.

---

# Métricas de éxito

## Comerciales

- % de citas con anticipo pagado.
- reducción de no-show.
- conversión por canal.
- MRR por módulo.
- adopción de add-ons IA.

## Clínicas

- tiempo promedio de documentación.
- % de sugerencias IA aplicadas.
- % de huecos clínicos detectados y corregidos.
- uso por especialidad.

## Técnicas

- latencia p95 por endpoint crítico.
- tasa de errores 5xx.
- jobs IA fallidos.
- webhooks duplicados manejados correctamente.
- endpoints protegidos por guards canónicos.

## Seguridad/compliance

- accesos bloqueados por falta de capacidad.
- eventos de auditoría críticos.
- exportaciones de auditoría.
- incidentes abiertos/cerrados.
- cobertura de permisos por rol.

---

# Regla de mantenimiento

Este roadmap debe actualizarse cuando:

- se cierre un sprint completo;
- cambie el modelo comercial;
- se agregue una capacidad nueva al catálogo;
- se tome una decisión de proveedor crítico;
- se identifique deuda técnica que bloquee seguridad, monetización o escalabilidad.
