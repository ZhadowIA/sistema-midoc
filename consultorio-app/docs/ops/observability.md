# Observabilidad y alertas operativas mínimas

Base de eventos y checks que un log shipper / APM puede consumir para abrir alertas.

## Endpoints de health

| Endpoint | Propósito | Auth | Status esperado |
|---|---|---|---|
| `GET /api/health` | Liveness — el proceso responde | Público | 200 siempre mientras el proceso viva |
| `GET /api/health/ready` | Readiness — el proceso puede hablar con DB | Público | 200 si DB responde; 503 si no |
| `GET /api/internal/ops/queue-health` | Estado de cola de notificaciones y webhooks de pagos | `x-notification-secret` | 200 con `status=ok\|warn\|critical` |

## Eventos estructurados (log-based alerts)

Todos los eventos pasan por `logEvent` / `captureError` (`src/lib/observability.ts`) como JSON de una sola línea con `level`, `event`, `timestamp`, `context`. Un shipper (Datadog, Loki, CloudWatch, etc.) puede alertar por nombre de evento.

### Autenticación / abuso
- `auth.login.rate_limited` · `auth.patient.login.rate_limited` — **warn**. Alerta si > 5 eventos/15 min del mismo `email` o IP (posible brute-force).
- `auth.login.failed` · `auth.patient.login.failed` — **warn**. Alerta si un mismo `userId` acumula > 10 en 15 min.

### Integraciones externas
- `notifications.process.error` — **error**. Alerta inmediata (cron del bot caído o bug).
- `ops.queue_health.notifications.pending_backlog` — **critical**. Cola con pendientes > 60 min sin procesar.
- `ops.queue_health.notifications.pending_slow` — **warn**. Pendientes > 15 min.
- `ops.queue_health.notifications.failed_high` — **warn**. `FAILED` acumulados ≥ 10.
- `ops.queue_health.payments.webhook_errors` — **warn**. ≥ 5 webhooks con error no resuelto.
- `ops.queue_health.payments.webhook_received_pending` — **warn**. Eventos en `RECEIVED` sin procesar (requieren reconciliación).

### Infraestructura
- `health.ready.db_unreachable` — **critical**. DB no responde.
- Cualquier `*.error` proveniente de `captureError` en rutas `/api/*` = 5xx. Alertar si tasa > 1% por 5 min.

### Performance de endpoints críticos

Los endpoints críticos registran `api.endpoint.duration` con:

- `endpoint`
- `method`
- `durationMs`
- `statusCode`
- `severity` (`ok`, `warning`, `critical`)
- `thresholdWarnMs`, `thresholdCriticalMs`

Umbrales activos:

| Endpoint | Warn | Critical |
|---|---:|---:|
| `api.agenda.dashboard.summary` | 700 ms | 1400 ms |
| `api.agenda.day` | 500 ms | 1000 ms |
| `api.agenda.week` | 600 ms | 1200 ms |
| `api.agenda.availability.slots` | 400 ms | 900 ms |
| `api.public.appointments.create` | 900 ms | 1800 ms |
| `api.notifications.process` | 1200 ms | 2500 ms |
| `api.payments.webhook` | 1000 ms | 2200 ms |
| `api.ai.note.generate` | 900 ms | 1800 ms |

## Métricas base (Semana 3)

Se emiten como evento estructurado `event="metric"` desde `emitMetric` (`src/lib/observability.ts`), con:

- `context.domain` (`auth`, `agenda`, `whatsapp`)
- `context.metric`
- `context.value`
- `context.tags`

### Auth
- `patient_login_success`
- `patient_login_failed` (tag `reason`)
- `patient_login_rate_limited`
- `patient_login_locked`
- `patient_login_error`

### Agenda
- `public_booking_attempt`
- `public_booking_success`
- `public_booking_validation_error`
- `public_booking_failed`
- `public_booking_blocked_recaptcha` (tag `reason`)
- `payments_webhook_received`
- `payments_webhook_idempotent_hit`
- `payments_webhook_processed` (tag `eventType`)
- `payments_webhook_error`
- `payments_webhook_reconcile_run` (tags `total`, `processed`, `failed`)
- `payments_webhook_reconcile_error`

### WhatsApp
- `incoming_message_received`
- `incoming_intent_detected` (tag `intent`)
- `incoming_message_processed` (tags `action`, `hasMatchedAppointment`)
- `incoming_message_error`
- `notification_cron_run`
- `notification_cron_error`

## Umbrales de queue-health

| Señal | Umbral warn | Umbral critical | Acción sugerida |
|---|---|---|---|
| Edad del `PENDING` más viejo | 15 min | 60 min | Revisar cron y `whatsapp-bot`. Si bot caído, documentar ventana y reintento |
| `FAILED` acumulados | 10 | — | Revisar `notifications.process.error` recientes y causa raíz |
| `PaymentWebhookEvent` con error no procesado | 5 | — | Revisar firma, conectividad con proveedor, reintentos |

## Polling recomendado

- `GET /api/health` cada 30 s (monitor externo tipo UptimeRobot / Checkly).
- `GET /api/health/ready` cada 60 s.
- `GET /api/internal/ops/queue-health` cada 5 min (mismo cron que `notifications/process`, con ventana aparte).

## Correlación

Incluir `requestId` en logs no está implementado aún. Pendiente de Fase 10.3+: instrumentar un middleware que inyecte `x-request-id` y propague al log JSON. Mientras tanto, `userId` / `appointmentId` / `email` son las claves de correlación disponibles.

## Exportación a APM externo

El diseño es agnóstico: cualquier agente que recoja `stdout` del proceso Next puede parsear los logs JSON. No se incluye aún exporter nativo (Datadog/Sentry/etc.) para no acoplar vendor antes de decidirlo.
