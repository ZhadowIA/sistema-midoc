# MiDoc - Mapa documental

Última actualización: 2026-05-19

## Criterios de clasificación
- **Canónico**: define la verdad actual del producto o de su planificación.
- **Vigente**: documento operativo activo, pero no rector.
- **Referencia**: contexto útil, diseño o evidencia específica.
- **Histórico**: conserva trazabilidad, pero ya no gobierna decisiones.
- **Archivado**: reemplazado o absorbido por documentos canónicos.

## Clasificación actual

### Canónicos
- `docs/INDICE_DOCUMENTACION.md`
- `docs/SISTEMA_ACTUAL.md`
- `docs/ROADMAP_MAESTRO.md`
- `docs/FASES_COMPLETADAS.md`
- `docs/MAPA_DOCUMENTAL.md`

### Vigentes
- `docs/DEPLOY_CHECKLIST.md`
- `docs/PRE_PRODUCCION_CAMBIOS_REQUERIDOS.md`
- `docs/security-hardening.md`
- `docs/compliance/ai-claims-policy.md`
- `docs/compliance/nom-matrix.md`
- `docs/ops/go-live-p0-evidence-checklist.md`
- `docs/ops/commercial-state-policy.md`
- `docs/ops/minimum-alerts-matrix.md`
- `docs/ops/backup-restore.md`
- `docs/ops/observability.md`
- `docs/ops/smoke-tests.md`
- `docs/security/incident-response.md`
- `docs/privacy/*`
- `docs/ops/runbook-*.md`

### Referencia útil
- `plan_implementacion_historia_clinica_midoc.md`
- `docs/design-brief.md`
- `docs/workspace_unified_status.md`
- `docs/acta_piloto_workspace_unificado.md`
- `docs/api-product-separation.md`
- `frontend/DESIGN_BRIEF.md`
- `frontend/TABLA_MAESTRA_VISTAS.md`

### Históricos / archivados
- `docs/archive/README_legacy_tecnico.md`
- `docs/archive/README_old_respaldo.md`
- `docs/archive/roadmap_fases_midoc.md`
- `docs/archive/ROADMAP_FASES_BLOQUES.md`
- `docs/archive/roadmap_priorizado_midoc.md`
- `docs/archive/compliance-roadmap.md`
- `docs/archive/ops/go-live-roadmap-4-6-semanas.md`

## Cambios aplicados en esta limpieza
1. Se eliminó la competencia entre varios roadmaps y se creó `docs/ROADMAP_MAESTRO.md` como único roadmap rector.
2. Se separó el historial de entregas cerradas en `docs/FASES_COMPLETADAS.md`.
3. Se sacaron del flujo principal los README técnicos legacy y los roadmaps absorbidos.
4. Se mantuvo trazabilidad mediante archivado, no borrado.

## Regla para documentos futuros
- Nuevo documento de estado o roadmap: solo si NO duplica uno existente.
- Documento reemplazado: mover a `docs/archive/` en la misma PR.
- Documento de diseño: debe declarar explícitamente que no es fuente de verdad funcional.
