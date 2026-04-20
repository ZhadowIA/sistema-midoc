# Workspace Unificado - Estado y Criterios de Cierre

Fecha de actualización: 2026-04-18 (noche)

## Decisiones cerradas

### 6) Indicador de guardado vs IA
- Decisión UX: `AiInsightsPanel` mantiene loading local y no participa en `combinedSaveState`.
- Motivo: generar sugerencias IA es acción one-shot y no persistencia clínica.
- Evidencia en código: `src/components/clinical/AiInsightsPanel.tsx` (comentario + estado local `loading`).

### 11) `scratch/` y `plan_implementacion_historia_clinica_midoc.md`
- Decisión: versionar `plan_implementacion_historia_clinica_midoc.md` como documentación interna.
- Motivo: mantiene trazabilidad del plan y criterios de entrega.
- `scratch/`: pendiente de crear política formal; por ahora no se usa como carpeta de trabajo oficial en este repo.

### 7) Limpieza legado `/medico/citas/[id]/consulta/page.tsx`
- Estado: cerrado en código.
- Evidencia:
  - `src/app/medico/citas/[id]/consulta/ClientPage.tsx` contiene la implementación clásica.
  - `src/app/medico/citas/[id]/consulta/page.tsx` queda como entrypoint delgado (wrapper).
- Nota: el retiro total de la ruta clásica sigue atado al trigger operativo del flag en prod.

## Backlog operativo (con trigger de cierre)

### 7) Limpieza legado `/medico/citas/[id]/consulta/page.tsx`
- Trigger de retiro:
  1. `CONSULTA_UNIFIED_ENABLED` activo para 100% del tráfico médico en prod.
  2. 2 semanas sin regresiones P1/P2 en flujo de consulta.
- Acción cuando se cumpla trigger:
  1. mover/encapsular entrypoint clásico en `ClientPage.tsx` temporal,
  2. eliminar ruta clásica en el siguiente release estable.
- Owner sugerido: Frontend + Tech Lead.

### 8) Historia clínica longitudinal (Fase 6-7)
- Criterio de cierre:
  1. vista por paciente con historial versionado visible,
  2. apertura de versión histórica,
  3. smoke manual validado por producto.
- Owner sugerido: Backend clínico + Frontend expediente.
- Estado actual: `IN_PROGRESS`.
- Evidencia implementada:
  - API `GET /api/admin/patients/[id]/clinical-history` ahora incluye `versions[]`.
  - UI en `src/app/medico/pacientes/[id]/historia-clinica/page.tsx` renderiza lista y lectura de versión histórica (solo lectura).
  - Test integración actualizado: `src/tests/integration/clinicalDb.test.ts` valida listado ordenado + snapshot de versión.

### 9) Apagar `CONSULTA_UNIFIED_ENABLED` en prod
- Criterio de cierre:
  1. piloto con >= 1 médico real,
  2. métricas mínimas aceptadas (cierre, errores firma, tiempo consulta, incidencias),
  3. rollback documentado.
- Owner sugerido: Producto + Operación + Tech Lead.
- Plantilla oficial de evidencia: `docs/acta_piloto_workspace_unificado.md`.

## Mini-checklist de ejecución real (7, 8, 9)

### Pendiente 7 - Limpieza legado `/medico/citas/[id]/consulta/page.tsx`
- Owner:
  - Responsable técnico: ____________________
  - Responsable producto: ____________________
- Fecha objetivo: ____________________
- Evidencia mínima para cerrar:
  - [ ] Confirmación de trigger cumplido (100% tráfico unificado + 2 semanas sin P1/P2)
  - [ ] PR de migración/retiro de ruta clásica
  - [ ] Build + smoke de navegación en QA
  - [ ] Nota de release con cambio de ruta/flag
- Estado: `OPEN | IN_PROGRESS | DONE`

### Pendiente 8 - Historia clínica longitudinal (Fase 6-7)
- Owner:
  - Responsable técnico: ____________________
  - Responsable producto: ____________________
- Fecha objetivo: ____________________
- Evidencia mínima para cerrar:
  - [ ] UI de expediente por paciente consumiendo `ClinicalHistoryService`
  - [ ] Versionado visible (lista con metadata mínima)
  - [ ] Apertura/lectura de versión histórica validada
  - [ ] Prueba de integración/API y smoke manual documentados
- Estado: `IN_PROGRESS`

### Pendiente 9 - Apagar `CONSULTA_UNIFIED_ENABLED` en producción
- Owner:
  - Responsable técnico: ____________________
  - Responsable operación: ____________________
  - Responsable producto: ____________________
- Fecha objetivo: ____________________
- Evidencia mínima para cerrar:
  - [ ] Piloto con >= 1 médico real completado
  - [ ] Métricas aceptadas (tasa cierre, errores firma, tiempo consulta, incidencias)
  - [ ] Plan de rollback validado y documentado
  - [ ] Acta go/no-go firmada por producto + técnica
  - [ ] Cambio de flag aplicado en prod y monitoreo post-cambio
- Estado: `OPEN | IN_PROGRESS | DONE`

## Notas de validación técnica
- Los puntos cerrados en código deben acompañarse de tests en `src/tests`.
- Los puntos operativos requieren evidencia documental adicional a código.
