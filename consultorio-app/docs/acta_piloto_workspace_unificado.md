# Acta de Piloto y Decisión Go/No-Go

Fecha: ____________________  
Proyecto: Workspace Unificado (`CONSULTA_UNIFIED_ENABLED`)  
Entorno: Producción  
Responsable Producto: ____________________  
Responsable Técnico: ____________________  
Responsable Operación: ____________________

## 1) Alcance del Piloto

- Médico participante (mínimo 1 real):
  - Nombre: ____________________
  - Especialidad: ____________________
  - ID interno: ____________________
- Ventana del piloto:
  - Inicio: ____________________
  - Fin: ____________________
- Cobertura:
  - [ ] Solo médico piloto con flag activo
  - [ ] Resto de médicos sin cambios

## 2) Criterios de Éxito (definir antes de iniciar)

- Tasa de cierre de consulta (objetivo): `>= 95%`
- Errores de firma (máximo permitido): `<= 2%` de intentos de firma
- Tiempo promedio de consulta (objetivo): `<= +10%` vs línea base del médico
- Incidencias P1/P2 (objetivo): `0` P1 y `<= 1` P2 con mitigación en <24h
- Satisfacción cualitativa del médico (objetivo): `>= 4/5`

## 3) Métricas Observadas (resultado del piloto)

- Consultas iniciadas: ____________________
- Consultas cerradas (`COMPLETED`): ____________________
- Tasa de cierre real: ____________________  (fórmula: cerradas / iniciadas)
- Firmas exitosas: ____________________
- Firmas fallidas: ____________________
- Tasa de error de firma: ____________________  (fórmula: fallidas / (exitosas + fallidas))
- Tiempo promedio por consulta: ____________________  (comparar contra baseline)
- Incidencias P1: ____________________
- Incidencias P2: ____________________
- Incidencias P3: ____________________

## 4) Incidencias Relevantes

| Fecha | Severidad | Descripción | Estado | Acción correctiva |
|---|---|---|---|---|
| ____ | ____ | ____ | ____ | ____ |
| ____ | ____ | ____ | ____ | ____ |
| ____ | ____ | ____ | ____ | ____ |

## 5) Validación de Rollback (obligatoria)

- Fecha simulacro rollback: ____________________
- Responsable ejecución: ____________________
- Pasos ejecutados:
  1. Desactivar `CONSULTA_UNIFIED_ENABLED` para médico piloto.
  2. Verificar apertura de nuevas consultas en flujo previo.
  3. Confirmar integridad de datos clínicos sin pérdida/corrupción.
- Resultado:
  - [ ] Exitoso
  - [ ] Fallido
- Tiempo total de rollback: ____________________
- Evidencia (logs/capturas/enlace): ____________________

## 6) Checklist de Evidencia para Cierre

- [ ] Piloto ejecutado con al menos 1 médico real.
- [ ] Métricas mínimas recopiladas y comparadas contra objetivos.
- [ ] Incidencias P1/P2 cerradas o con mitigación aceptada.
- [ ] Rollback probado y documentado.
- [ ] Decisión formal Go/No-Go registrada.
- [ ] Plan de monitoreo post-cambio definido (24-72h).
- [ ] Aprobación explícita de producto + técnica + operación.

## 7) Decisión Final

- Resultado:
  - [ ] GO (apagar flag global)
  - [ ] NO-GO (mantener piloto / plan correctivo)
- Justificación:
  - ________________________________________________________________
  - ________________________________________________________________
  - ________________________________________________________________

## 8) Plan de Ejecución Post-Decisión

### Si GO

1. Apagar `CONSULTA_UNIFIED_ENABLED` global en producción.
2. Monitorear métricas críticas durante 24-72h.
3. Registrar postmortem corto de despliegue.
4. Criterio de estabilidad post-cambio: `0` P1 y sin degradación >10% en cierre/firma.

### Si NO-GO

1. Mantener activación parcial del piloto.
2. Ejecutar plan correctivo con owner y fecha:
   - Acción 1: ____________________ | Owner: ____________________ | Fecha: ____________________
   - Acción 2: ____________________ | Owner: ____________________ | Fecha: ____________________
3. Reprogramar nueva fecha de evaluación.

## 9) Firmas de Aprobación

- Producto: ____________________  Fecha: ____________________
- Técnica: ____________________   Fecha: ____________________
- Operación: ____________________ Fecha: ____________________

---

## Anexo A) Comandos/checks sugeridos de verificación

1. Confirmar estado de rama local vs remoto:
   - `git rev-list --left-right --count origin/main...main`
2. Validar suite relevante antes de cambios de flag:
   - `npm run test:integration`
   - `npm run build`
3. Registrar estado limpio de cambios:
   - `git status --short`

## Anexo B) Decisión rápida (regla práctica)

- **GO** si se cumplen todos:
  1. Tasa de cierre `>= 95%`.
  2. Error de firma `<= 2%`.
  3. P1 = `0` y P2 dentro de umbral.
  4. Rollback validado exitosamente.
  5. Médico piloto reporta satisfacción `>= 4/5`.
- **NO-GO** si falla cualquiera de los anteriores.
