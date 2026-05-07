# MiDoc - Indice de Documentacion

Ultima actualizacion: 2026-04-20

## Objetivo
Este indice centraliza que documento es vigente, cual es historico y para que se usa cada archivo.

## Documentos vigentes

| Archivo | Uso | Estado |
|---|---|---|
| `docs/SISTEMA_ACTUAL.md` | Fuente de verdad funcional y tecnica del sistema actual | Vigente |
| `docs/roadmap_fases_midoc.md` | Roadmap operativo detallado por fases y estado real de avance | Vigente (canónico) |
| `docs/ROADMAP_FASES_BLOQUES.md` | Resumen ejecutivo de capacidades consolidadas y backlog | Vigente (resumen) |
| `docs/DEPLOY_CHECKLIST.md` | Checklist operativo para desplegar a staging/produccion | Vigente |
| `docs/PRE_PRODUCCION_CAMBIOS_REQUERIDOS.md` | Lista de cambios obligatorios antes de go-live comercial | Vigente |
| `docs/ops/go-live-roadmap-4-6-semanas.md` | Ruta priorizada de 4–6 semanas para producción comercial segura | Vigente |
| `docs/ops/go-live-p0-evidence-checklist.md` | Checklist P0 con evidencia obligatoria para salida a producción | Vigente |
| `docs/ops/commercial-state-policy.md` | Política canónica de estado comercial, gracia y degradación | Vigente |
| `docs/ops/minimum-alerts-matrix.md` | Matriz mínima de alertas exigible antes de go-live | Vigente |
| `plan_implementacion_historia_clinica_midoc.md` | Plan detallado de historia clínica (ubicado en raíz del repo) | Referencia vigente |
| `docs/acta_piloto_workspace_unificado.md` | Evidencia y acuerdos del piloto del workspace unificado | Vigente |
| `docs/workspace_unified_status.md` | Estado operativo del workspace unificado | Vigente |

## Documentos de referencia/legacy

| Archivo | Uso | Estado |
|---|---|---|
| `docs/README.md` | Documento tecnico anterior, conservado por trazabilidad | Legacy |
| `docs/README_OLD.md` | Respaldo historico del documento tecnico anterior | Legacy |
| `docs/design-brief.md` | Brief de UI/UX para rediseno visual, no es fuente tecnica de backend | Referencia |

## Orden recomendado para onboarding tecnico
1. Leer `docs/SISTEMA_ACTUAL.md`.
2. Revisar `docs/roadmap_fases_midoc.md`.
3. Revisar `docs/ROADMAP_FASES_BLOQUES.md`.
4. Revisar `docs/PRE_PRODUCCION_CAMBIOS_REQUERIDOS.md`.
5. Revisar `docs/ops/go-live-roadmap-4-6-semanas.md` y `docs/ops/go-live-p0-evidence-checklist.md`.
6. Antes de release, ejecutar `docs/DEPLOY_CHECKLIST.md`.
