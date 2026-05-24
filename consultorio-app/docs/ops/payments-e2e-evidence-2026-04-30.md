# Evidencia — Validación E2E de pagos productivos

Fecha: 2026-04-30  
Entorno: STAGING/PROD-SIM  
Proveedor objetivo: `STRIPE`  
Responsable: `PENDIENTE`

## Precondiciones

- Credenciales separadas por entorno (staging/prod)
- Webhook configurado con secreto correcto
- Usuario de prueba comercial dedicado
- Trazabilidad habilitada (`PaymentWebhookEvent`, `DoctorSubscription`, `AuditLog`)
- `PAYMENTS_PROVIDER=STRIPE`
- Price IDs productivos configurados por plan/add-on:
  - `STRIPE_PRICE_AGENDA_MONTHLY`
  - `STRIPE_PRICE_CLINICAL_MONTHLY`
  - `STRIPE_PRICE_INTEGRAL_MONTHLY`
  - `STRIPE_PRICE_AI_30_MONTHLY`
  - `STRIPE_PRICE_AI_60_MONTHLY`
  - `STRIPE_PRICE_AI_100_MONTHLY`

## Matriz E2E obligatoria

| Caso | Resultado esperado | Evidencia |
|---|---|---|
| Alta de suscripción | `DoctorSubscription.status=ACTIVE` + acceso comercial habilitado | `PENDIENTE` |
| Renovación | nuevo ciclo (`currentPeriodStart/End`) + evento de pago exitoso | `PENDIENTE` |
| Impago | transición a `PAST_DUE` + UI accionable + degradación según política | `PENDIENTE` |
| Cancelación | `cancelAtPeriodEnd=true` y/o `CANCELED` según caso | `PENDIENTE` |
| Reactivación | regreso a `ACTIVE` + restauración de capacidades | `PENDIENTE` |
| Webhook repetido (idempotencia) | sin duplicar efectos de negocio | `PENDIENTE` |
| Reconciliación webhook fallido | eventos `FAILED/RECEIVED` se recuperan vía `/api/internal/payments/reconcile` | `PENDIENTE` |

## Script de ejecución por caso

### 1) Alta
- Acción:
- IDs de referencia (customer/subscription/session):
- Evidencia (logs/DB/captura):
- Resultado: `PENDIENTE`

### 2) Renovación
- Acción:
- Evidencia:
- Resultado: `PENDIENTE`

### 3) Impago
- Acción:
- Evidencia:
- Resultado: `PENDIENTE`

### 4) Cancelación
- Acción:
- Evidencia:
- Resultado: `PENDIENTE`

### 5) Reactivación
- Acción:
- Evidencia:
- Resultado: `PENDIENTE`

### 6) Reenvío webhook/idempotencia
- Acción (replay):
- Evidencia (sin doble efecto):
- Resultado: `PENDIENTE`

## Evidencia técnica mínima por corrida

- Salida de endpoint webhook (200/202 según diseño)
- Registro en `PaymentWebhookEvent` (incluyendo repetidos)
- Snapshot antes/después de `DoctorSubscription`
- Confirmación UI de estado comercial para médico

## Criterio de cierre Sección 1

Solo marcar `[x]` en checklist cuando TODOS los casos estén en `OK` con evidencia enlazada en este archivo.
