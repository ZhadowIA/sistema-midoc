# Matriz mínima de alertas para producción

Estado: Vigente  
Última actualización: 2026-04-29  
Complementa: `docs/ops/observability.md`

## Objetivo

Definir el set mínimo de alertas que deben existir antes de producción comercial.

Este documento NO reemplaza la observabilidad técnica existente. La aterriza en un criterio de salida operativo.

---

## Alertas obligatorias

| Categoría | Señal | Severidad | Umbral inicial | Acción esperada |
|---|---|---|---|---|
| API | tasa de 5xx | Critical | > 1% durante 5 min | revisar deploy, DB, proveedor o regresión |
| Pagos | webhook de pago con error | Warn / Critical | ≥ 1 repetido, critical si crece backlog | revisar firma, conectividad y reproceso |
| Notificaciones | `FAILED` acumulados | Warn | ≥ 10 | revisar cola y cron |
| Notificaciones | `PENDING` muy viejo | Critical | > 60 min | revisar procesamiento interno |
| Performance | endpoint crítico en severidad `critical` | Warn / Critical | según umbral del endpoint | revisar regresión o dependencia externa |
| IA | job IA fallido sostenido | Warn | > 5 en 15 min por módulo | revisar proveedor/modelo |
| IA | costo anómalo | Warn | desviación relevante vs promedio reciente | revisar loops, abuso o mala configuración |
| Seguridad | login rate limited anómalo | Warn | volumen fuera de baseline | revisar brute-force |
| Seguridad | incidente P0/P1 abierto | Critical | inmediato | ejecutar runbook |

---

## Canales mínimos recomendados

### Producción

- **Critical:** canal sincrónico inmediato
  - Teams / Slack / WhatsApp operativo / Pager
- **Warn:** canal operativo de seguimiento
  - Teams / Slack / Email técnico

### Staging

- alertas visibles, pero separadas de producción
- nunca mezclar canales de staging con incidentes reales de prod

---

## Reglas de implementación

1. Toda alerta debe tener:
   - nombre
   - umbral
   - severidad
   - dueño
   - primera acción sugerida

2. Toda alerta debe mapear a:
   - un evento estructurado
   - un endpoint de health
   - o una consulta explícita de backlog/errores

3. Si una alerta no tiene acción, no está terminada.

---

## Dueños recomendados

| Área | Dueño inicial |
|---|---|
| Pagos | responsable técnico del flujo comercial |
| Notificaciones | responsable técnico de operaciones internas |
| Seguridad | responsable técnico principal |
| IA | responsable técnico del stack clínico/IA |
| Infra/API | responsable técnico principal |

En operación de una sola persona, el dueño es el mismo, pero el documento obliga a distinguir el tipo de incidente.

---

## Criterio de salida

No hacer go-live comercial hasta que:

- exista al menos una alerta implementada por cada categoría obligatoria;
- se haya validado al menos una simulación por categoría crítica;
- exista un runbook asociado para pagos, rollback, IA y seguridad.
