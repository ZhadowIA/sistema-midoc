# Runbook — Pagos en producción (Stripe)

Fecha base: 2026-05-02

## Objetivo

Cerrar operación E2E de pagos con:

1. Webhook idempotente y trazable (`PaymentWebhookEvent`)
2. Reconciliación automática de eventos fallidos/pendientes
3. Checklist operativo para incidentes

## Endpoints clave

- `POST /api/payments/webhook`
- `POST /api/internal/payments/reconcile?limit=50`
- `POST /api/internal/payments/process` (caducidad de anticipos)
- `GET /api/internal/ops/queue-health`

## Seguridad

- `POST /api/internal/payments/reconcile` exige header:
  - `x-notification-secret: <NOTIFICATION_CRON_SECRET>`

## Flujo recomendado en producción

1. Stripe envía eventos al webhook.
2. El sistema guarda evento en `PaymentWebhookEvent` como `RECEIVED`.
3. Se procesa negocio (suscripción/anticipo) y se marca `PROCESSED`.
4. Si falla, queda `FAILED` con `processingError`.
5. Un job operativo invoca `POST /api/internal/payments/reconcile` para reprocesar `FAILED`/`RECEIVED`.

## Comando operativo (reconciliación)

```bash
curl -X POST \
  "https://<APP_BASE_URL>/api/internal/payments/reconcile?limit=50" \
  -H "x-notification-secret: <NOTIFICATION_CRON_SECRET>"
```

Respuesta esperada:

```json
{
  "success": true,
  "total": 12,
  "processed": 11,
  "failed": 1,
  "processedAt": "2026-05-02T..."
}
```

## Alertas mínimas a monitorear

- `payments_webhook_error`
- `payments_webhook_reconcile_error`
- `payments_webhook_reconcile_run` con `failed > 0`
- `queue-health` con `payments.webhook_errors >= 5`

## Criterio de cierre de incidente

Un incidente de pagos se considera cerrado cuando:

1. `PaymentWebhookEvent` backlog en `FAILED/RECEIVED` vuelve a 0 o tendencia decreciente controlada.
2. Reconciliación termina con `failed = 0` en al menos 2 corridas consecutivas.
3. `DoctorSubscription` y/o `Appointment.paymentStatus` reflejan el estado real en Stripe.
