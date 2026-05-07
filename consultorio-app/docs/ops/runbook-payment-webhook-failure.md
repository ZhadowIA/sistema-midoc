# Runbook — Fallo de webhook de pagos

Estado: Vigente  
Última actualización: 2026-04-29

## Cuándo usarlo

- backlog de `PaymentWebhookEvent` con error
- desalineación entre proveedor y DB
- alta/cancelación/renovación no reflejada

## Objetivo

Restablecer sincronización entre proveedor de pagos y estado interno.

## Pasos

1. Confirmar tipo de evento afectado.
2. Revisar:
   - firma
   - conectividad
   - payload
   - idempotencia
3. Identificar si el problema es:
   - un evento aislado
   - una regresión general
   - una rotación fallida de secretos
4. Corregir causa.
5. Reprocesar el evento o lote afectado.
6. Validar que la suscripción/cita cambió al estado esperado.
7. Auditar corrección e impacto.

## No hacer

- no mutar estados manualmente como primera respuesta
- no reprocesar en bucle sin corregir la causa raíz
