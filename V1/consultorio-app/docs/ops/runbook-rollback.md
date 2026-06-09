# Runbook — Rollback operativo

Estado: Vigente  
Última actualización: 2026-04-29

## Cuándo usarlo

- deploy con regresión crítica
- 5xx sostenidos
- corrupción funcional inmediata tras release

## Objetivo

Restaurar servicio estable con mínima pérdida de tiempo y mínima ambigüedad.

## Pasos

1. Confirmar versión desplegada y hora de inicio del incidente.
2. Validar si el problema es:
   - código
   - variable de entorno
   - migración
   - proveedor externo
3. Si el problema es código o configuración reciente:
   - revertir a versión estable previa
4. Si hubo migración incompatible:
   - evaluar rollback de app + restore de backup según playbook
5. Repetir smoke tests mínimos:
   - login
   - dashboard
   - agenda
   - endpoint público
   - notificaciones
6. Registrar incidente y dejar post-mortem si fue P0/P1

## No hacer

- no improvisar cambios manuales en producción sin registrarlos
- no hacer rollback parcial sin smoke posterior
