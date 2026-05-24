# MiDoc - Índice maestro de documentación

Última actualización: 2026-05-19

## Objetivo
Este índice define la arquitectura documental oficial del proyecto. Aquí se decide QUÉ documento es canónico, cuál es de soporte y cuál quedó archivado.

## Documentos canónicos

| Archivo | Propósito | Estado |
|---|---|---|
| `docs/SISTEMA_ACTUAL.md` | Fuente de verdad funcional y técnica del sistema implementado | Canónico |
| `docs/ROADMAP_MAESTRO.md` | Roadmap único del producto, consolidado y contrastado contra el código real | Canónico |
| `docs/FASES_COMPLETADAS.md` | Historial de fases cerradas con evidencia técnica | Canónico |
| `docs/MAPA_DOCUMENTAL.md` | Inventario documental con clasificación y criterio de limpieza | Canónico |
| `docs/DEPLOY_CHECKLIST.md` | Checklist operativo de despliegue | Vigente |
| `docs/PRE_PRODUCCION_CAMBIOS_REQUERIDOS.md` | Bloqueadores y requisitos previos a producción comercial | Vigente |
| `docs/ops/go-live-p0-evidence-checklist.md` | Evidencia mínima exigible para salida a producción | Vigente |
| `docs/ops/commercial-state-policy.md` | Política canónica de estados comerciales y degradación | Vigente |
| `docs/ops/minimum-alerts-matrix.md` | Matriz mínima de alertas | Vigente |
| `docs/compliance/ai-claims-policy.md` | Política de claims permitidos/prohibidos para IA | Vigente |
| `docs/compliance/nom-matrix.md` | Matriz viva NOM-004 / NOM-024 y brechas | Vigente |
| `plan_implementacion_historia_clinica_midoc.md` | Anexo de diseño/alcance para historia clínica completa; ya no opera como roadmap separado | Referencia vigente |

## Documentos vigentes de soporte

| Archivo | Propósito | Estado |
|---|---|---|
| `docs/design-brief.md` | Referencia UI/UX; no es fuente técnica de backend ni roadmap | Referencia |
| `docs/security-hardening.md` | Endurecimiento técnico de seguridad | Referencia |
| `docs/security/incident-response.md` | Proceso y severidades para incidentes de seguridad | Vigente |
| `docs/privacy/*` | Políticas de retención, inventario de datos y subprocesadores | Vigente |
| `docs/ops/*.md` | Runbooks, backups, observabilidad, humo, rollback y operación diaria | Vigente |
| `docs/workspace_unified_status.md` | Estado operativo del workspace clínico unificado | Referencia |
| `docs/acta_piloto_workspace_unificado.md` | Evidencia histórica del piloto del workspace unificado | Referencia |
| `docs/api-product-separation.md` | Nota arquitectónica puntual | Referencia |

## Documentos archivados

Todos los documentos reemplazados o absorbidos por la nueva estructura viven en `docs/archive/`.

Archivados en esta limpieza:
- `docs/archive/README_legacy_tecnico.md`
- `docs/archive/README_old_respaldo.md`
- `docs/archive/roadmap_fases_midoc.md`
- `docs/archive/ROADMAP_FASES_BLOQUES.md`
- `docs/archive/roadmap_priorizado_midoc.md`
- `docs/archive/compliance-roadmap.md`
- `docs/archive/ops/go-live-roadmap-4-6-semanas.md`

## Orden recomendado de lectura
1. `docs/SISTEMA_ACTUAL.md`
2. `docs/ROADMAP_MAESTRO.md`
3. `docs/FASES_COMPLETADAS.md`
4. `docs/MAPA_DOCUMENTAL.md`
5. `docs/PRE_PRODUCCION_CAMBIOS_REQUERIDOS.md`
6. `docs/ops/go-live-p0-evidence-checklist.md`
7. `docs/DEPLOY_CHECKLIST.md`

## Regla de mantenimiento
- Si un documento define el estado actual del producto, debe contrastarse contra código real.
- Si un roadmap queda absorbido por otro, se archiva; NO compite por canonicidad.
- Si un documento solo aporta contexto histórico, no debe seguir en el flujo principal.
