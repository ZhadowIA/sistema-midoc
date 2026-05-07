# Runbook — Impago y degradación comercial

Estado: Vigente  
Última actualización: 2026-04-29

## Cuándo usarlo

- `DoctorSubscription.status = PAST_DUE`
- fallo de renovación
- reclamo de cliente por acceso degradado tras impago

## Objetivo

Regularizar el estado comercial sin perder control de la degradación funcional.

## Pasos

1. Confirmar estado actual de suscripción y fecha de corte.
2. Confirmar si el cliente está en:
   - gracia blanda,
   - degradación,
   - suspensión comercial.
3. Verificar si el fallo viene de:
   - método de pago,
   - webhook no procesado,
   - inconsistencia de estado interno.
4. Si el problema es webhook:
   - revisar backlog
   - reprocesar evento
   - validar idempotencia
5. Si el problema es cobro real:
   - mantener mensaje visible en UI
   - guiar al cliente a actualizar pago
6. Si se corrige el cobro:
   - validar transición de estado
   - restaurar capacidades según plan
   - auditar la corrección

## No hacer

- no reactivar manualmente sin entender causa raíz
- no quitar degradación premium sin confirmar regularización
- no comunicar “fallo del sistema” si el problema es financiero y confirmado
