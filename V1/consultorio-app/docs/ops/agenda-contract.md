# Contrato unificado de Agenda (Día/Semana)

## Objetivo
Garantizar consistencia entre `/api/agenda/admin/agenda/day` y `/api/agenda/admin/agenda/week`.

## Reglas de rango temporal
- Ambos endpoints usan **intersección de rango** para incluir eventos:
  - `event.startTime < rangeEndExclusive`
  - `event.endTime > rangeStart`
- Esto evita discrepancias entre vista día y semana cuando una cita cruza límites de slot.

## Campos de salida relevantes
- `dateLocal`: fecha en zona canónica de app.
- `time`: hora en zona canónica de app.
- `startTime` / `endTime`: datetime UTC persistido.

## Zona horaria canónica
- Variable obligatoria: `APP_TIMEZONE` (default: `America/Chihuahua`).
- Transformación de `dateLocal` y `time` para DTOs de agenda se realiza en esa zona.

## Semántica de render en vista diaria
- La vista diaria asigna eventos a un renglón por **overlap de intervalo**, no por igualdad exacta `HH:mm`.
